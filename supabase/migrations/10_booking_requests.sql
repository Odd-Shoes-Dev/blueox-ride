-- Step 10 of 10 — Booking requests (ask a driver for a seat, with your own stops and offer)
-- Run this in Supabase Dashboard -> SQL Editor (after 09_seat_controls.sql)
--
-- A passenger who wants something other than the whole route at the listed price — a
-- different pickup or drop-off along the way, or a different price per seat — sends the
-- driver a REQUEST instead of booking instantly. The driver sees where they'd get in and
-- off and what they offer, and accepts or refuses. Accepting creates a normal confirmed
-- booking (so seats, "picked up", no-shows and trip mode all work as usual).
--
-- Rules enforced here in the database (so they can't be bypassed from the app):
--   * at most 3 requests per passenger per ride (the first, plus two retries)
--   * a retry after a refusal must change something (offer, seats, pickup or drop-off)
--   * one waiting request per passenger per ride; at most 5 waiting across all rides
--   * a driver can refuse with a reason and stop further requests from that person on the ride
--   * a request expires after 2 hours, or at departure if that is sooner
-- See docs/booking-requests.md.

-- =====================
-- 1. WHERE A BOOKING STARTS/ENDS, AND THE PRICE AGREED
-- =====================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pickup_name TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pickup_lat DECIMAL(10, 8);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pickup_lng DECIMAL(11, 8);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dropoff_name TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dropoff_lat DECIMAL(10, 8);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dropoff_lng DECIMAL(11, 8);
-- Price per seat that was agreed (NULL = the ride's listed price)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS agreed_price INTEGER;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_agreed_price_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_agreed_price_check CHECK (agreed_price IS NULL OR agreed_price >= 0);

-- =====================
-- 2. THE REQUESTS TABLE
-- =====================

CREATE TABLE IF NOT EXISTS public.booking_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  -- The ride's driver, copied here so each side can be notified and can only see its own rows
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 4),
  -- What the passenger offers to pay, per seat, in UGX
  offer_price INTEGER NOT NULL CHECK (offer_price > 0),
  -- Where they want to get in and off (NULL = the ride's own start / end)
  pickup_name TEXT,
  pickup_lat DECIMAL(10, 8),
  pickup_lng DECIMAL(11, 8),
  dropoff_name TEXT,
  dropoff_lat DECIMAL(10, 8),
  dropoff_lng DECIMAL(11, 8),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  decline_reason TEXT
    CHECK (decline_reason IS NULL OR decline_reason IN ('offer_too_low', 'pickup_too_far', 'seats_reserved', 'other')),
  -- The driver refused and asked not to get any more requests from this person on this ride
  blocked BOOLEAN NOT NULL DEFAULT false,
  -- 1 for the first request from this person on this ride, 2 for the next, ...
  attempt_no INTEGER NOT NULL,
  -- Set when the driver accepts
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  church_id UUID REFERENCES public.churches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_driver ON public.booking_requests(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_passenger ON public.booking_requests(passenger_id, ride_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_ride ON public.booking_requests(ride_id);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Each side sees only its own requests. Nobody writes to the table directly: every change
-- goes through the functions below, which check the rules.
DROP POLICY IF EXISTS "Passengers and drivers can view their requests" ON public.booking_requests;
CREATE POLICY "Passengers and drivers can view their requests"
  ON public.booking_requests FOR SELECT
  USING (passenger_id = auth.uid() OR driver_id = auth.uid());

GRANT SELECT ON public.booking_requests TO authenticated;

-- Live updates: lets the app tell a driver the moment a request arrives, and a passenger
-- the moment it is answered.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'booking_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;
  END IF;
END $$;

-- =====================
-- 3. INTERNAL: CREATE THE BOOKING WHEN A REQUEST IS ACCEPTED
-- =====================
-- Same idea as book_ride (08), but for a named passenger and with stops and an agreed
-- price. Not callable from the app: only respond_to_booking_request uses it.

CREATE OR REPLACE FUNCTION public._create_booking_from_request(p_request public.booking_requests)
RETURNS UUID AS $$
DECLARE
  v_existing public.bookings%ROWTYPE;
  v_booking_id UUID;
  v_paid BOOLEAN := public.payments_enabled();
  v_fee INTEGER;
BEGIN
  v_fee := CASE WHEN v_paid THEN CEIL(p_request.offer_price * 0.10)::INTEGER * p_request.seats ELSE 0 END;

  SELECT * INTO v_existing
  FROM public.bookings
  WHERE ride_id = p_request.ride_id AND passenger_id = p_request.passenger_id;

  IF FOUND THEN
    IF v_existing.status NOT IN ('cancelled_by_passenger', 'cancelled_by_driver') THEN
      RAISE EXCEPTION 'This person already has a booking on this ride';
    END IF;

    UPDATE public.bookings
    SET seats_booked = p_request.seats,
        booking_fee = v_fee,
        status = 'pending_payment',
        church_id = COALESCE(p_request.church_id, church_id),
        pickup_name = p_request.pickup_name,
        pickup_lat = p_request.pickup_lat,
        pickup_lng = p_request.pickup_lng,
        dropoff_name = p_request.dropoff_name,
        dropoff_lat = p_request.dropoff_lat,
        dropoff_lng = p_request.dropoff_lng,
        agreed_price = p_request.offer_price,
        picked_up_at = NULL,
        no_show = false
    WHERE id = v_existing.id;

    v_booking_id := v_existing.id;
  ELSE
    INSERT INTO public.bookings (
      ride_id, passenger_id, seats_booked, booking_fee, status, church_id,
      pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, agreed_price
    ) VALUES (
      p_request.ride_id, p_request.passenger_id, p_request.seats, v_fee, 'pending_payment', p_request.church_id,
      p_request.pickup_name, p_request.pickup_lat, p_request.pickup_lng,
      p_request.dropoff_name, p_request.dropoff_lat, p_request.dropoff_lng, p_request.offer_price
    )
    RETURNING id INTO v_booking_id;
  END IF;

  -- Free: confirm right away (an UPDATE, so the seat-counting rule runs).
  IF NOT v_paid THEN
    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public._create_booking_from_request(public.booking_requests) FROM PUBLIC, anon, authenticated;

-- =====================
-- 4. PASSENGER: SEND A REQUEST
-- =====================

CREATE OR REPLACE FUNCTION public.request_booking(
  p_ride_id UUID,
  p_seats INTEGER,
  p_offer INTEGER,
  p_pickup_name TEXT DEFAULT NULL,
  p_pickup_lat DECIMAL DEFAULT NULL,
  p_pickup_lng DECIMAL DEFAULT NULL,
  p_dropoff_name TEXT DEFAULT NULL,
  p_dropoff_lat DECIMAL DEFAULT NULL,
  p_dropoff_lng DECIMAL DEFAULT NULL,
  p_church_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  c_max_attempts CONSTANT INTEGER := 3;
  c_max_open CONSTANT INTEGER := 5;
  v_ride public.rides%ROWTYPE;
  v_last public.booking_requests%ROWTYPE;
  v_attempts INTEGER;
  v_open INTEGER;
  v_expires TIMESTAMPTZ;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to send a request';
  END IF;
  IF p_seats IS NULL OR p_seats < 1 OR p_seats > 4 THEN
    RAISE EXCEPTION 'Choose between 1 and 4 seats';
  END IF;
  IF p_offer IS NULL OR p_offer <= 0 THEN
    RAISE EXCEPTION 'Enter how much you can pay per seat';
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found';
  END IF;
  IF v_ride.driver_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot request a seat on your own ride';
  END IF;
  IF v_ride.status <> 'active' OR v_ride.departure_time <= NOW() THEN
    RAISE EXCEPTION 'This ride is no longer available';
  END IF;
  IF v_ride.available_seats < p_seats THEN
    RAISE EXCEPTION 'Only % seat(s) left on this ride', v_ride.available_seats;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE ride_id = p_ride_id AND passenger_id = auth.uid()
      AND status NOT IN ('cancelled_by_passenger', 'cancelled_by_driver')
  ) THEN
    RAISE EXCEPTION 'You already have a booking on this ride';
  END IF;

  -- The driver asked not to hear from this person again on this ride
  IF EXISTS (
    SELECT 1 FROM public.booking_requests
    WHERE ride_id = p_ride_id AND passenger_id = auth.uid() AND blocked
  ) THEN
    RAISE EXCEPTION 'The driver is not taking more requests from you on this ride';
  END IF;

  -- One waiting request at a time on a ride
  IF EXISTS (
    SELECT 1 FROM public.booking_requests
    WHERE ride_id = p_ride_id AND passenger_id = auth.uid() AND status = 'pending' AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'You already have a request waiting on this ride';
  END IF;

  -- A limited number of attempts per ride
  SELECT COUNT(*) INTO v_attempts
  FROM public.booking_requests
  WHERE ride_id = p_ride_id AND passenger_id = auth.uid();

  IF v_attempts >= c_max_attempts THEN
    RAISE EXCEPTION 'You have used all % requests on this ride', c_max_attempts;
  END IF;

  -- After a refusal, a new request has to change something
  SELECT * INTO v_last
  FROM public.booking_requests
  WHERE ride_id = p_ride_id AND passenger_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_last.status = 'declined'
     AND v_last.offer_price = p_offer
     AND v_last.seats = p_seats
     AND v_last.pickup_lat IS NOT DISTINCT FROM p_pickup_lat
     AND v_last.pickup_lng IS NOT DISTINCT FROM p_pickup_lng
     AND v_last.dropoff_lat IS NOT DISTINCT FROM p_dropoff_lat
     AND v_last.dropoff_lng IS NOT DISTINCT FROM p_dropoff_lng THEN
    RAISE EXCEPTION 'Change your offer, seats, or pickup/drop-off before asking again';
  END IF;

  -- A cap on requests waiting across all rides, so nobody floods drivers
  SELECT COUNT(*) INTO v_open
  FROM public.booking_requests
  WHERE passenger_id = auth.uid() AND status = 'pending' AND expires_at > NOW();

  IF v_open >= c_max_open THEN
    RAISE EXCEPTION 'You already have % requests waiting. Wait for answers or withdraw one first', c_max_open;
  END IF;

  v_expires := LEAST(v_ride.departure_time, NOW() + INTERVAL '2 hours');

  INSERT INTO public.booking_requests (
    ride_id, driver_id, passenger_id, seats, offer_price,
    pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng,
    attempt_no, church_id, expires_at
  ) VALUES (
    p_ride_id, v_ride.driver_id, auth.uid(), p_seats, p_offer,
    p_pickup_name, p_pickup_lat, p_pickup_lng, p_dropoff_name, p_dropoff_lat, p_dropoff_lng,
    v_attempts + 1, p_church_id, v_expires
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.request_booking(
  UUID, INTEGER, INTEGER, TEXT, DECIMAL, DECIMAL, TEXT, DECIMAL, DECIMAL, UUID
) TO authenticated;

-- =====================
-- 5. PASSENGER: WITHDRAW A WAITING REQUEST
-- =====================

CREATE OR REPLACE FUNCTION public.withdraw_booking_request(p_request_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  UPDATE public.booking_requests
  SET status = 'withdrawn', responded_at = NOW()
  WHERE id = p_request_id AND passenger_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, or it has already been answered';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.withdraw_booking_request(UUID) TO authenticated;

-- =====================
-- 6. DRIVER: ACCEPT OR REFUSE
-- =====================
-- Returns what happened: 'accepted', 'declined' or 'expired'.

CREATE OR REPLACE FUNCTION public.respond_to_booking_request(
  p_request_id UUID,
  p_accept BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_block BOOLEAN DEFAULT false
)
RETURNS TEXT AS $$
DECLARE
  v_req public.booking_requests%ROWTYPE;
  v_ride public.rides%ROWTYPE;
  v_booking_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT * INTO v_req
  FROM public.booking_requests
  WHERE id = p_request_id AND driver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found on one of your rides';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been answered';
  END IF;

  IF v_req.expires_at <= NOW() THEN
    UPDATE public.booking_requests SET status = 'expired', responded_at = NOW() WHERE id = p_request_id;
    RETURN 'expired';
  END IF;

  IF p_accept THEN
    SELECT * INTO v_ride FROM public.rides WHERE id = v_req.ride_id FOR UPDATE;

    IF v_ride.status <> 'active' OR v_ride.departure_time <= NOW() THEN
      RAISE EXCEPTION 'This ride is no longer available';
    END IF;
    IF v_ride.available_seats < v_req.seats THEN
      RAISE EXCEPTION 'Not enough seats are left for this request';
    END IF;

    v_booking_id := public._create_booking_from_request(v_req);

    UPDATE public.booking_requests
    SET status = 'accepted', booking_id = v_booking_id, responded_at = NOW()
    WHERE id = p_request_id;

    RETURN 'accepted';
  END IF;

  UPDATE public.booking_requests
  SET status = 'declined',
      decline_reason = CASE
        WHEN p_reason IN ('offer_too_low', 'pickup_too_far', 'seats_reserved', 'other') THEN p_reason
        ELSE 'other'
      END,
      blocked = COALESCE(p_block, false),
      responded_at = NOW()
  WHERE id = p_request_id;

  RETURN 'declined';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.respond_to_booking_request(UUID, BOOLEAN, TEXT, BOOLEAN) TO authenticated;

-- =====================
-- 7. INSTANT BOOKING RESPECTS A BLOCK
-- =====================
-- Same function as 08, plus one check: if the driver refused a rider and asked not to hear
-- from them again on this ride, they can't skip the request by booking instantly instead.

CREATE OR REPLACE FUNCTION public.book_ride(
  p_ride_id UUID,
  p_seats INTEGER,
  p_church_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_ride public.rides%ROWTYPE;
  v_existing public.bookings%ROWTYPE;
  v_booking_id UUID;
  v_paid BOOLEAN := public.payments_enabled();
  v_fee INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to book a ride';
  END IF;

  IF p_seats IS NULL OR p_seats < 1 OR p_seats > 4 THEN
    RAISE EXCEPTION 'Choose between 1 and 4 seats';
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found';
  END IF;
  IF v_ride.driver_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot book your own ride';
  END IF;
  IF v_ride.status <> 'active' OR v_ride.departure_time <= NOW() THEN
    RAISE EXCEPTION 'This ride is no longer available';
  END IF;
  IF v_ride.available_seats < p_seats THEN
    RAISE EXCEPTION 'Only % seat(s) left on this ride', v_ride.available_seats;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_requests
    WHERE ride_id = p_ride_id AND passenger_id = auth.uid() AND blocked
  ) THEN
    RAISE EXCEPTION 'The driver is not taking more bookings from you on this ride';
  END IF;

  v_fee := CASE WHEN v_paid THEN CEIL(v_ride.price * 0.10)::INTEGER * p_seats ELSE 0 END;

  SELECT * INTO v_existing
  FROM public.bookings
  WHERE ride_id = p_ride_id AND passenger_id = auth.uid();

  IF FOUND THEN
    -- One booking per passenger per ride: a cancelled one can be re-used, a live one cannot.
    IF v_existing.status NOT IN ('cancelled_by_passenger', 'cancelled_by_driver') THEN
      RAISE EXCEPTION 'You already have a booking on this ride';
    END IF;

    UPDATE public.bookings
    SET seats_booked = p_seats,
        booking_fee = v_fee,
        status = 'pending_payment',
        church_id = COALESCE(p_church_id, church_id),
        -- a fresh instant booking is for the whole route at the listed price
        pickup_name = NULL, pickup_lat = NULL, pickup_lng = NULL,
        dropoff_name = NULL, dropoff_lat = NULL, dropoff_lng = NULL,
        agreed_price = NULL,
        picked_up_at = NULL,
        no_show = false
    WHERE id = v_existing.id;

    v_booking_id := v_existing.id;
  ELSE
    INSERT INTO public.bookings (ride_id, passenger_id, seats_booked, booking_fee, status, church_id)
    VALUES (p_ride_id, auth.uid(), p_seats, v_fee, 'pending_payment', p_church_id)
    RETURNING id INTO v_booking_id;
  END IF;

  -- Free: confirm immediately (an UPDATE, so the seat-counting trigger runs).
  IF NOT v_paid THEN
    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.book_ride(UUID, INTEGER, UUID) TO authenticated;

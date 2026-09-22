-- Step 15 — Every booking now goes through the driver; there is no instant path any more
-- Run this in Supabase Dashboard -> SQL Editor (after 14_ride_request_visibility.sql)
--
-- Booking a seat on a driver-posted ride always used to have two paths: book instantly at the
-- ride's own route and listed price (book_ride, 08), or send the driver a request when the stop
-- or price was different (request_booking, 10). From now on there is only one path — every
-- booking is a request the driver has to accept — so a driver never has a seat taken without
-- seeing who it is first, and can choose between several people asking for the same seats
-- (e.g. pick the higher offer) instead of it being first-come-first-served automatically.
-- See docs/booking-requests.md.
--
-- (This does not touch the OTHER direction — a driver accepting a passenger's posted "I need a
-- ride" via accept_ride_request, 07 — because there the driver's own tap on Accept already IS
-- their confirmation; nothing there was ever automatic.)

-- =====================
-- 1. CLOSE THE INSTANT PATH AT THE DATABASE, NOT JUST IN THE APP
-- =====================
-- The app no longer calls this, but the function still exists (harmless) — revoking EXECUTE means
-- it can't be called directly through the API either, the same way the app's own UI can't reach it.

REVOKE EXECUTE ON FUNCTION public.book_ride(UUID, INTEGER, UUID) FROM authenticated;

-- =====================
-- 2. A REQUEST NOW WAITS UNTIL DEPARTURE, NOT A FIXED 2 HOURS
-- =====================
-- Requests used to be the exception (a negotiation on top of instant booking), so a short expiry
-- made sense. Now they're the only way to book, so a request should stay open for the driver to
-- answer for as long as the ride hasn't left — once it expires, the ride has already departed, so
-- there is nothing left to retry anyway.
--
-- Also raises the attempt limit from 3 to 4 (still per ride, not per driver — asking on two of the
-- same driver's rides is two separate budgets).

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
  c_max_attempts CONSTANT INTEGER := 4;
  c_max_open CONSTANT INTEGER := 5;
  v_ride public.rides%ROWTYPE;
  v_last public.booking_requests%ROWTYPE;
  v_attempts INTEGER;
  v_open INTEGER;
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

  INSERT INTO public.booking_requests (
    ride_id, driver_id, passenger_id, seats, offer_price,
    pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng,
    attempt_no, church_id, expires_at
  ) VALUES (
    p_ride_id, v_ride.driver_id, auth.uid(), p_seats, p_offer,
    p_pickup_name, p_pickup_lat, p_pickup_lng, p_dropoff_name, p_dropoff_lat, p_dropoff_lng,
    v_attempts + 1, p_church_id, v_ride.departure_time
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

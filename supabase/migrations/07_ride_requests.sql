-- Step 07 of 7 — Ride Requests (passenger-posted demand + upfront pricing)
-- Run this in Supabase Dashboard -> SQL Editor (after 06_church_commissions.sql)
--
-- Lets a passenger post "I need a ride: from X to Y, budget Z, N seats"
-- instead of only browsing driver-posted rides. A driver accepts a request
-- at the stated budget (no in-app negotiation) which atomically creates a
-- real ride + booking through the existing pipeline, so payment/refund/
-- cancellation logic never has to know requests exist.

CREATE TYPE ride_request_status AS ENUM ('open', 'matched', 'cancelled', 'expired');

CREATE TABLE public.ride_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  passenger_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  origin_name TEXT NOT NULL,
  origin_lat DECIMAL(10, 8) NOT NULL,
  origin_lng DECIMAL(11, 8) NOT NULL,

  destination_name TEXT NOT NULL,
  destination_lat DECIMAL(10, 8) NOT NULL,
  destination_lng DECIMAL(11, 8) NOT NULL,

  departure_time TIMESTAMPTZ NOT NULL,
  budget INTEGER NOT NULL CHECK (budget > 0), -- passenger's budget per seat, in UGX
  seats_needed INTEGER NOT NULL DEFAULT 1 CHECK (seats_needed > 0 AND seats_needed <= 4),
  notes TEXT,

  status ride_request_status DEFAULT 'open',
  matched_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_request_departure CHECK (departure_time > NOW() - INTERVAL '1 hour')
);

CREATE INDEX idx_ride_requests_passenger ON public.ride_requests(passenger_id);
CREATE INDEX idx_ride_requests_status ON public.ride_requests(status);
CREATE INDEX idx_ride_requests_departure ON public.ride_requests(departure_time);

CREATE TRIGGER ride_requests_updated_at
  BEFORE UPDATE ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;

-- Open requests are visible to everyone (drivers browsing); passengers can
-- always see their own regardless of status (to track matched/cancelled).
CREATE POLICY "Open requests are viewable by everyone"
  ON public.ride_requests FOR SELECT
  USING (status = 'open' OR passenger_id = auth.uid());

CREATE POLICY "Passengers can create their own requests"
  ON public.ride_requests FOR INSERT
  WITH CHECK (auth.uid() = passenger_id);

-- Passengers can only update (e.g. cancel) their own still-open requests.
-- The transition to 'matched' happens only via accept_ride_request() below.
CREATE POLICY "Passengers can update own open requests"
  ON public.ride_requests FOR UPDATE
  USING (passenger_id = auth.uid() AND status = 'open');

-- Atomically accepts a request: creates the ride (owned by the calling
-- driver), creates the matching booking (owned by the request's passenger),
-- and marks the request matched. Returns the new ride id (not the booking
-- id) since it's the driver calling this, and the ride is what they should
-- land on afterward. SECURITY DEFINER because the driver calling this isn't
-- the passenger, so the normal bookings RLS insert check
-- (auth.uid() = passenger_id) would otherwise block step 2.
CREATE OR REPLACE FUNCTION accept_ride_request(
  p_request_id UUID,
  p_departure_time TIMESTAMPTZ,
  p_price INTEGER,
  p_car_brand TEXT DEFAULT NULL,
  p_car_model TEXT DEFAULT NULL,
  p_car_year INTEGER DEFAULT NULL,
  p_car_photo_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_request public.ride_requests;
  v_ride_id UUID;
  v_booking_id UUID;
  v_booking_fee INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept a request';
  END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id AND status = 'open'
  FOR UPDATE;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Request not found or already matched';
  END IF;

  IF v_request.passenger_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot accept your own request';
  END IF;

  INSERT INTO public.rides (
    driver_id, origin_name, origin_lat, origin_lng,
    destination_name, destination_lat, destination_lng,
    departure_time, price, total_seats, available_seats,
    car_brand, car_model, car_year, car_photo_id, status
  ) VALUES (
    auth.uid(), v_request.origin_name, v_request.origin_lat, v_request.origin_lng,
    v_request.destination_name, v_request.destination_lat, v_request.destination_lng,
    p_departure_time, p_price, v_request.seats_needed, v_request.seats_needed,
    p_car_brand, p_car_model, p_car_year, p_car_photo_id, 'active'
  )
  RETURNING id INTO v_ride_id;

  v_booking_fee := ROUND(p_price * v_request.seats_needed * 0.10);

  INSERT INTO public.bookings (ride_id, passenger_id, seats_booked, booking_fee, status)
  VALUES (v_ride_id, v_request.passenger_id, v_request.seats_needed, v_booking_fee, 'pending_payment')
  RETURNING id INTO v_booking_id;

  UPDATE public.ride_requests
  SET status = 'matched', matched_booking_id = v_booking_id, updated_at = NOW()
  WHERE id = p_request_id;

  RETURN v_ride_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

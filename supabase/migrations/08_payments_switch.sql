-- Step 08 of 8 — Payments switch (free bookings while the app grows)
-- Run this in Supabase Dashboard -> SQL Editor (after 07_ride_requests.sql)
--
-- Adds ONE switch, app_settings.payments_enabled, that decides whether bookings cost
-- money. It is FALSE after this migration: booking a seat is free, the booking is
-- confirmed immediately, and the driver's price is simply paid to the driver in cash.
-- Nothing is charged, no payment is created, and no church commission accrues.
--
-- To turn payments back on later (10% online booking fee via Pesapal, as before):
--   UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'payments_enabled';
-- To turn them off again:
--   UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'payments_enabled';
-- The app, the edge functions and every rule below read this same setting.

-- =====================
-- 1. SETTINGS TABLE
-- =====================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone (including signed-out visitors) can read settings so the app can adapt its wording.
-- There are no insert/update policies: only you, in the SQL Editor, can change them.
DROP POLICY IF EXISTS "App settings are readable by everyone" ON public.app_settings;
CREATE POLICY "App settings are readable by everyone"
  ON public.app_settings FOR SELECT
  USING (true);

GRANT SELECT ON public.app_settings TO anon, authenticated;

INSERT INTO public.app_settings (key, value)
VALUES ('payments_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.payments_enabled()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'payments_enabled'),
    false
  );
$$ LANGUAGE sql STABLE;

-- =====================
-- 2. A FREE BOOKING HAS A FEE OF 0
-- =====================

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_fee_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_booking_fee_check CHECK (booking_fee >= 0);

-- =====================
-- 3. BOOK A SEAT
-- =====================
-- One call that checks the ride, creates the booking and — while payments are off —
-- confirms it straight away (which also takes the seats off the ride, via the existing
-- booking_seats_update trigger). While payments are on it creates the booking as
-- 'pending_payment' with the 10% fee, exactly like before.

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
        church_id = COALESCE(p_church_id, church_id)
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

-- =====================
-- 4. CONFIRM AN OLD UNPAID BOOKING
-- =====================
-- Bookings made before this switch that were still waiting for payment: while payments
-- are off, the passenger can simply confirm them.

CREATE OR REPLACE FUNCTION public.confirm_pending_booking(p_booking_id UUID)
RETURNS VOID AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_ride public.rides%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to confirm a booking';
  END IF;
  IF public.payments_enabled() THEN
    RAISE EXCEPTION 'Payments are on: complete the payment to confirm this booking';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND passenger_id = auth.uid() AND status = 'pending_payment'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found, or it is already confirmed';
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;

  IF v_ride.status <> 'active' OR v_ride.departure_time <= NOW() THEN
    RAISE EXCEPTION 'This ride is no longer available';
  END IF;
  IF v_ride.available_seats < v_booking.seats_booked THEN
    RAISE EXCEPTION 'Not enough seats are left on this ride';
  END IF;

  UPDATE public.bookings SET booking_fee = 0, status = 'confirmed' WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_pending_booking(UUID) TO authenticated;

-- =====================
-- 5. RIDE REQUESTS: NO FEE WHILE FREE
-- =====================
-- Same function as 07, except the booking it creates is free and confirmed straight
-- away when payments are off.

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
  v_paid BOOLEAN := public.payments_enabled();
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

  v_booking_fee := CASE WHEN v_paid THEN ROUND(p_price * v_request.seats_needed * 0.10) ELSE 0 END;

  INSERT INTO public.bookings (ride_id, passenger_id, seats_booked, booking_fee, status)
  VALUES (v_ride_id, v_request.passenger_id, v_request.seats_needed, v_booking_fee, 'pending_payment')
  RETURNING id INTO v_booking_id;

  UPDATE public.ride_requests
  SET status = 'matched', matched_booking_id = v_booking_id, updated_at = NOW()
  WHERE id = p_request_id;

  -- Free: the passenger has nothing to pay, so the booking is confirmed right away.
  IF NOT v_paid THEN
    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  RETURN v_ride_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- 6. NO CHURCH COMMISSION WHEN NOTHING WAS CHARGED
-- =====================
-- Same function as 06, plus one line: while payments are off there is no booking fee,
-- so nothing is owed to a partner church. (Bookings made during the free period never
-- earn a commission, even after payments are switched on later.)

CREATE OR REPLACE FUNCTION create_church_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.payments_enabled() THEN
    RETURN NEW;
  END IF;

  -- Only create commission if booking has a church_id and status is confirmed
  IF NEW.church_id IS NOT NULL AND NEW.status = 'confirmed' THEN
    -- Check if commission already exists for this booking
    IF NOT EXISTS (SELECT 1 FROM church_commissions WHERE booking_id = NEW.id) THEN
      -- Get the ride price
      DECLARE
        v_ride_price DECIMAL(10, 2);
        v_booking_fee DECIMAL(10, 2);
        v_commission DECIMAL(10, 2);
      BEGIN
        SELECT price INTO v_ride_price FROM rides WHERE id = NEW.ride_id;
        v_booking_fee := v_ride_price * 0.10;  -- 10% booking fee
        v_commission := v_booking_fee * 0.50;   -- 50% of booking fee goes to church

        INSERT INTO church_commissions (
          church_id,
          booking_id,
          ride_price,
          booking_fee,
          commission_amount
        ) VALUES (
          NEW.church_id,
          NEW.id,
          v_ride_price,
          v_booking_fee,
          v_commission
        );

        -- Update church total
        UPDATE churches
        SET total_commission_earned = total_commission_earned + v_commission,
            updated_at = NOW()
        WHERE id = NEW.church_id;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

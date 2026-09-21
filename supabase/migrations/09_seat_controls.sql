-- Step 09 of 9 — Seat controls for drivers
-- Run this in Supabase Dashboard -> SQL Editor (after 08_payments_switch.sql)
--
-- Lets a driver keep the seat count true while driving:
--   * adjust_ride_seats()      — change "seats left" by hand (e.g. -1 when someone is picked
--                                up on the road; +1 when someone gets out)
--   * set_booking_picked_up()  — tick a booked passenger as "in the car"
--   * mark_booking_no_show()   — a booked passenger never turned up: free their seat
-- and keeps a ride's Active/Full status in step with its seats however they change.

-- =====================
-- 1. NEW BOOKING COLUMNS
-- =====================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show BOOLEAN NOT NULL DEFAULT false;

-- =====================
-- 2. RIDE STATUS FOLLOWS ITS SEATS
-- =====================
-- Whenever seats change (by a booking, a cancellation or the driver), an Active ride with no
-- seats left becomes Full, and a Full ride with a seat free becomes Active again. Rides that
-- are completed or cancelled are left alone.

CREATE OR REPLACE FUNCTION public.sync_ride_full_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('active', 'full') THEN
    IF NEW.available_seats <= 0 THEN
      NEW.status := 'full';
    ELSIF NEW.status = 'full' THEN
      NEW.status := 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rides_sync_full_status ON public.rides;
CREATE TRIGGER rides_sync_full_status
  BEFORE UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.sync_ride_full_status();

-- Same function as 01, with one fix: giving seats back when a booking is cancelled now only
-- re-opens a ride that was Full. Before, it also flipped a ride the driver had cancelled back
-- to Active.
CREATE OR REPLACE FUNCTION update_available_seats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    -- Decrease available seats
    UPDATE public.rides
    SET available_seats = available_seats - NEW.seats_booked
    WHERE id = NEW.ride_id;

    -- Mark ride as full if no seats left
    UPDATE public.rides
    SET status = 'full'
    WHERE id = NEW.ride_id AND available_seats = 0 AND status = 'active';

  ELSIF NEW.status IN ('cancelled_by_passenger', 'cancelled_by_driver')
        AND OLD.status = 'confirmed' THEN
    -- Restore available seats (and re-open the ride only if it was Full)
    UPDATE public.rides
    SET available_seats = available_seats + OLD.seats_booked,
        status = CASE WHEN status = 'full' THEN 'active'::ride_status ELSE status END
    WHERE id = NEW.ride_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- 3. CHANGE SEATS LEFT BY HAND
-- =====================

CREATE OR REPLACE FUNCTION public.adjust_ride_seats(p_ride_id UUID, p_delta INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_ride public.rides%ROWTYPE;
  v_new INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id AND driver_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found, or it is not yours';
  END IF;
  IF v_ride.status NOT IN ('active', 'full') THEN
    RAISE EXCEPTION 'This ride is no longer active';
  END IF;

  v_new := v_ride.available_seats + p_delta;
  IF v_new < 0 OR v_new > v_ride.total_seats THEN
    RAISE EXCEPTION 'Seats left must stay between 0 and %', v_ride.total_seats;
  END IF;

  -- The status (Active/Full) is kept in step by the rides_sync_full_status trigger.
  UPDATE public.rides SET available_seats = v_new WHERE id = p_ride_id;

  RETURN v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.adjust_ride_seats(UUID, INTEGER) TO authenticated;

-- =====================
-- 4. "IN THE CAR" TICK
-- =====================

CREATE OR REPLACE FUNCTION public.set_booking_picked_up(p_booking_id UUID, p_picked_up BOOLEAN)
RETURNS VOID AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT b.* INTO v_booking
  FROM public.bookings b
  JOIN public.rides r ON r.id = b.ride_id
  WHERE b.id = p_booking_id AND r.driver_id = auth.uid()
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found on one of your rides';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed booking can be marked as picked up';
  END IF;

  UPDATE public.bookings
  SET picked_up_at = CASE WHEN p_picked_up THEN NOW() ELSE NULL END
  WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_booking_picked_up(UUID, BOOLEAN) TO authenticated;

-- =====================
-- 5. NO-SHOW
-- =====================
-- The passenger never turned up: cancel their booking, which gives the seats back (via the
-- booking_seats_update trigger) so someone else can have them. Only once the trip is about to
-- leave (within an hour of departure, or later), so it can't be used to drop bookings early.
-- If a booking fee was paid, it is not refunded (same as a late cancellation).

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(p_booking_id UUID)
RETURNS VOID AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_ride public.rides%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT b.* INTO v_booking
  FROM public.bookings b
  JOIN public.rides r ON r.id = b.ride_id
  WHERE b.id = p_booking_id AND r.driver_id = auth.uid()
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found on one of your rides';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed booking can be marked as a no-show';
  END IF;
  IF v_booking.picked_up_at IS NOT NULL THEN
    RAISE EXCEPTION 'This passenger is already marked as picked up';
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id;
  IF v_ride.departure_time > NOW() + INTERVAL '1 hour' THEN
    RAISE EXCEPTION 'You can mark a no-show once the trip is within an hour of leaving';
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled_by_driver', no_show = true
  WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(UUID) TO authenticated;

-- Step 13 — Let a driver edit their own ride
-- Run this in Supabase Dashboard -> SQL Editor (after 12_private_live_location.sql)
--
-- Drivers could already update their own ride row (RLS policy "Drivers can update own rides",
-- 01_schema.sql) with no restriction — the app just never offered a form for it. This adds the
-- restriction that was missing: once a ride has taken a seat (a booking, or the driver's own
-- seat adjustment), its ROUTE, TIME, PRICE and SEAT COUNT can no longer change underneath
-- whoever already committed to it. Notes and car details can always be edited.
-- The rule is enforced here, as a trigger, so it applies to every update path (the app's edit
-- form today, and anything else later) — not just one function that could be bypassed.
-- See docs/ride-editing.md.

CREATE OR REPLACE FUNCTION public.guard_ride_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_locked_fields_changed BOOLEAN;
  v_untouched BOOLEAN;
BEGIN
  v_locked_fields_changed :=
    NEW.origin_name IS DISTINCT FROM OLD.origin_name OR
    NEW.origin_lat IS DISTINCT FROM OLD.origin_lat OR
    NEW.origin_lng IS DISTINCT FROM OLD.origin_lng OR
    NEW.destination_name IS DISTINCT FROM OLD.destination_name OR
    NEW.destination_lat IS DISTINCT FROM OLD.destination_lat OR
    NEW.destination_lng IS DISTINCT FROM OLD.destination_lng OR
    NEW.departure_time IS DISTINCT FROM OLD.departure_time OR
    NEW.price IS DISTINCT FROM OLD.price OR
    NEW.total_seats IS DISTINCT FROM OLD.total_seats;

  IF NOT v_locked_fields_changed THEN
    RETURN NEW;
  END IF;

  -- "No seat taken yet" = seats left still equal to the total, AND no booking (of any live
  -- status) exists. Either one alone already implies the other in practice; checked together
  -- as a safety net against future code that might change one without the other.
  v_untouched := OLD.available_seats = OLD.total_seats
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings WHERE ride_id = OLD.id AND status <> 'cancelled'
    );

  IF NOT v_untouched THEN
    RAISE EXCEPTION 'This ride already has a booked or adjusted seat, so its route, time, price and seat count can no longer be changed. Notes and car details can still be edited.';
  END IF;

  -- Editing the seat count while nothing has touched it yet: keep "seats left" equal to the
  -- new total, the same as when the ride was first created.
  IF NEW.total_seats IS DISTINCT FROM OLD.total_seats THEN
    NEW.available_seats := NEW.total_seats;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Runs before rides_sync_full_status (09) and rides_updated_at (01) — both alphabetically
-- after "guard_edit" — so available_seats is settled here first, and status/updated_at then
-- react to the final row.
DROP TRIGGER IF EXISTS rides_guard_edit ON public.rides;
CREATE TRIGGER rides_guard_edit
  BEFORE UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.guard_ride_edit();

-- Step 16 — Fix a ride's departure-time check so it only fires when it should
-- Run this in Supabase Dashboard -> SQL Editor (after 15_always_ask_driver.sql)
--
-- `01_schema.sql` added CHECK (departure_time > NOW() - INTERVAL '1 hour') with the comment
-- "for new rides" — but a plain CHECK constraint is re-validated on EVERY update, not just
-- INSERT, and it checks against NOW() at the moment of that update, not against the time the
-- ride was created. So once a ride's departure slips more than an hour into the past, ANY update
-- to it — marking it completed, "Didn't happen", adjusting seats, ticking a passenger picked up,
-- anything — started failing outright with "violates check constraint valid_departure", even
-- though departure_time itself wasn't being touched.
--
-- Replaces it with a trigger that only checks departure_time when it's actually being set: on
-- INSERT (creating a ride), and on UPDATE only if departure_time itself is part of what changed
-- (editing it via Edit Ride). Every other update to an already-departed ride is unaffected.

CREATE OR REPLACE FUNCTION public.guard_ride_departure()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.departure_time IS DISTINCT FROM OLD.departure_time THEN
    IF NEW.departure_time <= NOW() - INTERVAL '1 hour' THEN
      RAISE EXCEPTION 'Departure time must be within the last hour or in the future';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.rides DROP CONSTRAINT IF EXISTS valid_departure;

-- Name sorts before "rides_guard_edit" (13) and "rides_sync_full_status" (09) alphabetically, but
-- neither reads or depends on the other's changes, so their relative order doesn't matter here.
DROP TRIGGER IF EXISTS rides_guard_departure ON public.rides;
CREATE TRIGGER rides_guard_departure
  BEFORE INSERT OR UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.guard_ride_departure();

-- Step 17 — Fix the same departure-time bug on ride_requests
-- Run this in Supabase Dashboard -> SQL Editor (after 16_fix_departure_check.sql)
--
-- Same bug as 16, on the other table that has this exact same constraint:
-- `07_ride_requests.sql`'s `valid_request_departure` CHECK (departure_time > NOW() - INTERVAL
-- '1 hour') is re-validated on every update, not just when a request is posted. Nothing marks an
-- unmatched "I need a ride" post as anything other than 'open' once its departure passes (there's
-- no auto-expiry), and My Rides' Requests tab shows every request a passenger has ever posted, so
-- trying to withdraw/cancel an old one that never got matched fails outright with "violates check
-- constraint valid_request_departure" — the same failure as 16, just on requests instead of rides.
-- Same fix, same reasoning: see 16_fix_departure_check.sql.

CREATE OR REPLACE FUNCTION public.guard_ride_request_departure()
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

ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS valid_request_departure;

DROP TRIGGER IF EXISTS ride_requests_guard_departure ON public.ride_requests;
CREATE TRIGGER ride_requests_guard_departure
  BEFORE INSERT OR UPDATE ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_ride_request_departure();

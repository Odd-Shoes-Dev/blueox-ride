-- Step 20 — Fix a self-defeating UPDATE policy on ride_requests
-- Run this in Supabase Dashboard -> SQL Editor (after 19_fix_rides_policy_recursion.sql)
--
-- `07_ride_requests.sql`'s UPDATE policy gave only a USING clause:
--   USING (passenger_id = auth.uid() AND status = 'open')
-- With no explicit WITH CHECK, Postgres reuses the USING expression as the check on the NEW row
-- too — so the row was required to STILL be 'open' after the update. That's fine for an update
-- that leaves status alone, but withdrawing a request sets status to 'cancelled', which the
-- implicit check then rejects: "new row violates row-level security policy for table
-- ride_requests". The one thing this policy exists to allow (open -> cancelled) was the one
-- thing it silently forbade.
--
-- Fix: an explicit WITH CHECK that only re-affirms ownership, not that status is still 'open'.
-- USING is unchanged — you can still only start this from your own, still-open request.
--
-- Checked every other UPDATE policy in the schema for the same shape of bug (a mutable status
-- value baked into USING, not just an ownership column): none of the others have it — they all
-- key off a foreign key that never changes on update (driver_id, passenger_id), which trivially
-- still holds after the row is written, so this is a one-off, not a pattern to sweep further.

DROP POLICY IF EXISTS "Passengers can update own open requests" ON public.ride_requests;

CREATE POLICY "Passengers can update own open requests"
  ON public.ride_requests FOR UPDATE
  USING (passenger_id = auth.uid() AND status = 'open')
  WITH CHECK (passenger_id = auth.uid());

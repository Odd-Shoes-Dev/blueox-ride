-- Step 14 — Open ride requests are for signed-in users only, not the public internet
-- Run this in Supabase Dashboard -> SQL Editor (after 13_ride_editing.sql)
--
-- "Open requests are viewable by everyone" (07_ride_requests.sql) had no restriction to
-- signed-in users, so an open request's route, budget and notes were readable by anyone —
-- including someone who has never signed in. This narrows it to `authenticated`. Posting a
-- request and accepting one already require being signed in, so this changes nothing for
-- anyone using the app normally. See docs/ride-editing.md.

DROP POLICY IF EXISTS "Open requests are viewable by everyone" ON public.ride_requests;

CREATE POLICY "Open requests are viewable by signed-in users"
  ON public.ride_requests FOR SELECT
  TO authenticated
  USING (status = 'open' OR passenger_id = auth.uid());

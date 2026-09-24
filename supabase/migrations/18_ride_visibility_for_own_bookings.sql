-- Step 18 — A passenger can always see a ride they have a real connection to
-- Run this in Supabase Dashboard -> SQL Editor (after 17_fix_ride_request_departure_check.sql)
--
-- `01_schema.sql`'s rule for reading a ride was: anyone can see it while it's active/full, and
-- the driver can always see their own. Once a ride becomes completed or cancelled, a PASSENGER
-- loses access to it entirely — they're not its driver, and it's no longer active/full, so the
-- rule blocks them. Any query that embeds a ride through a booking or booking request
-- (`ride:rides(*)`) then gets `ride: null` back for that row, not an error — and the app wasn't
-- written expecting that, so it crashes reading `.ride.id` the next time it renders.
--
-- This is what was actually breaking "My Bookings" once a booking's ride got marked completed —
-- exactly the outcome the "Mark Trip Completed" / "Didn't happen" / closure-nudge work earlier
-- this batch was making more common, not a new bug from that work itself.
--
-- Fix: a passenger can always see a ride they've booked, or ever sent a booking request for,
-- whatever its current status is — not just while it happens to be active/full.

DROP POLICY IF EXISTS "Active rides are viewable by everyone" ON public.rides;

CREATE POLICY "Rides are viewable by everyone while active, and always by their driver or a connected passenger"
  ON public.rides FOR SELECT
  USING (
    status IN ('active', 'full')
    OR driver_id = auth.uid()
    OR id IN (SELECT ride_id FROM public.bookings WHERE passenger_id = auth.uid())
    OR id IN (SELECT ride_id FROM public.booking_requests WHERE passenger_id = auth.uid())
  );

-- Step 19 — Fix infinite recursion introduced by migration 18
-- Run this in Supabase Dashboard -> SQL Editor (after 18_ride_visibility_for_own_bookings.sql)
--
-- Migration 18 added "a passenger can see a ride they've booked" to the rides SELECT policy by
-- querying the bookings table. But bookings' OWN SELECT policy (01_schema.sql) queries rides
-- right back — "or ride_id IN (SELECT id FROM rides WHERE driver_id = auth.uid())" — so
-- evaluating either policy now triggers the other, forever: Postgres detects the cycle and
-- refuses with "infinite recursion detected in policy for relation rides" (42P17), which broke
-- every query that reads rides through RLS, not just the passenger-visibility case 18 was fixing.
--
-- Fix: check bookings/booking_requests through a SECURITY DEFINER function instead of a plain
-- subquery. A SECURITY DEFINER function owned by a role with BYPASSRLS (postgres, here, same as
-- every other SECURITY DEFINER function in this project) runs its own queries without RLS
-- applying to them at all — so checking bookings from inside it never re-triggers bookings' own
-- policy, and the cycle never starts. booking_requests' policy doesn't reference rides at all
-- (it stores driver_id directly), so it was never actually part of the recursion — routed
-- through the same function anyway, for one place this rule lives instead of two.

CREATE OR REPLACE FUNCTION public.passenger_has_ride(p_ride_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings WHERE ride_id = p_ride_id AND passenger_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.booking_requests WHERE ride_id = p_ride_id AND passenger_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.passenger_has_ride(UUID) TO authenticated;

DROP POLICY IF EXISTS "Rides are viewable by everyone while active, and always by their driver or a connected passenger" ON public.rides;

CREATE POLICY "Rides are viewable by everyone while active, and always by their driver or a connected passenger"
  ON public.rides FOR SELECT
  USING (
    status IN ('active', 'full')
    OR driver_id = auth.uid()
    OR public.passenger_has_ride(id)
  );

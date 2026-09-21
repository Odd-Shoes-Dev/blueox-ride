-- Step 12 — Only the driver and confirmed passengers can use a ride's live-location channel
-- Run this in Supabase Dashboard -> SQL Editor (after 11_consent.sql)
--
-- While a trip runs, the driver's position is relayed on a Realtime Broadcast channel named
-- "ride-location-<ride id>". Ride ids are not secret (they are in every ride's link), so the channel
-- can't rely on its name. These rules make it a PRIVATE channel:
--   * send    -> only the ride's driver
--   * receive -> the ride's driver, and passengers with a CONFIRMED booking on that ride
-- Nobody else — other users, or people who aren't signed in — can join it.
-- The app opens the channel with { config: { private: true } } (locationRepository.ts).
-- Rules apply when a channel is joined, so someone who cancels mid-trip keeps receiving until
-- their connection next reconnects.
-- See docs/privacy-and-consent.md.

CREATE OR REPLACE FUNCTION public.can_use_ride_location_channel(p_topic TEXT, p_sending BOOLEAN)
RETURNS BOOLEAN AS $$
DECLARE
  v_ride_id UUID;
BEGIN
  -- Only "ride-location-<uuid>" topics are covered here; anything else is not allowed by this rule.
  IF p_topic IS NULL OR p_topic !~* '^ride-location-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  v_ride_id := substring(p_topic from 15)::UUID;

  IF EXISTS (SELECT 1 FROM public.rides WHERE id = v_ride_id AND driver_id = auth.uid()) THEN
    RETURN true;
  END IF;

  -- Passengers may listen but never send.
  IF p_sending THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.bookings
    WHERE ride_id = v_ride_id AND passenger_id = auth.uid() AND status = 'confirmed'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_use_ride_location_channel(TEXT, BOOLEAN) TO authenticated;

-- Receive
DROP POLICY IF EXISTS "Ride location: driver and confirmed passengers can listen" ON realtime.messages;
CREATE POLICY "Ride location: driver and confirmed passengers can listen"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND public.can_use_ride_location_channel(realtime.topic(), false)
  );

-- Send
DROP POLICY IF EXISTS "Ride location: only the driver can send" ON realtime.messages;
CREATE POLICY "Ride location: only the driver can send"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND public.can_use_ride_location_channel(realtime.topic(), true)
  );

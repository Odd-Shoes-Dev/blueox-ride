-- Step 21 — Passenger live location sharing (OFF by default)
-- Run this in Supabase Dashboard -> SQL Editor (after 20_fix_ride_request_update_check.sql)
--
-- Lets a passenger share their live position with the driver of a ride they've confirmed a seat
-- on, while the driver's trip is running — the reverse direction of the driver-location sharing
-- built in migration 12. Off by default, the same switch pattern as payments_enabled (08): the
-- code is fully wired, but nothing shares until app_settings.passenger_location_sharing_enabled
-- is turned on by hand.
--
-- This stays off deliberately until the company is registered as a data controller with Uganda's
-- Personal Data Protection Office — general business registration (URSB) is a separate thing and
-- does not cover this. See docs/privacy-and-consent.md.
--
-- To turn it on later:
--   UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'passenger_location_sharing_enabled';
-- To turn it off again:
--   UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'passenger_location_sharing_enabled';

-- =====================
-- 1. THE SWITCH
-- =====================

INSERT INTO public.app_settings (key, value)
VALUES ('passenger_location_sharing_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.passenger_location_sharing_enabled()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'passenger_location_sharing_enabled'),
    false
  );
$$ LANGUAGE sql STABLE;

-- =====================
-- 2. PRIVATE CHANNEL: ride-passenger-<ride id>-<passenger id>
-- =====================
-- One channel per (ride, passenger) pair, not one shared channel per ride — so a passenger's
-- position is never visible to any other passenger, only to the ride's driver and to themselves.
--   send    -> only that passenger, only while their booking on that ride is CONFIRMED, only
--              while the switch is on
--   receive -> the ride's driver, or that same passenger, same conditions
-- Same model as migration 12: rules apply when a channel is joined, so someone whose booking
-- changes mid-trip keeps their existing connection until it next reconnects.

CREATE OR REPLACE FUNCTION public.can_use_passenger_location_channel(p_topic TEXT, p_sending BOOLEAN)
RETURNS BOOLEAN AS $$
DECLARE
  v_ride_id UUID;
  v_passenger_id UUID;
BEGIN
  IF NOT public.passenger_location_sharing_enabled() THEN
    RETURN false;
  END IF;

  -- "ride-passenger-<uuid>-<uuid>" (ride id, then passenger id)
  IF p_topic IS NULL OR p_topic !~* (
    '^ride-passenger-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
    '-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RETURN false;
  END IF;

  v_ride_id := substring(p_topic from 16 for 36)::UUID;
  v_passenger_id := substring(p_topic from 53)::UUID;

  IF p_sending THEN
    RETURN v_passenger_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE ride_id = v_ride_id AND passenger_id = v_passenger_id AND status = 'confirmed'
    );
  END IF;

  IF v_passenger_id = auth.uid() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.rides WHERE id = v_ride_id AND driver_id = auth.uid());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_use_passenger_location_channel(TEXT, BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS "Passenger location: sender, driver or the passenger can listen" ON realtime.messages;
CREATE POLICY "Passenger location: sender, driver or the passenger can listen"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND public.can_use_passenger_location_channel(realtime.topic(), false)
  );

DROP POLICY IF EXISTS "Passenger location: only that confirmed passenger can send" ON realtime.messages;
CREATE POLICY "Passenger location: only that confirmed passenger can send"
  ON realtime.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND public.can_use_passenger_location_channel(realtime.topic(), true)
  );

-- =====================
-- 3. SHARING STOPS BY ITSELF ONCE THE DRIVER TICKS "PICKED UP"
-- =====================
-- Needs bookings to be on the realtime publication (postgres_changes, not broadcast — an actual
-- row update, not a relayed message) so a passenger's own client can notice picked_up_at being
-- set and stop broadcasting. The existing "Users can view own bookings" SELECT policy (01) already
-- covers reading their own row, so no new RLS is needed here, only the publication membership.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

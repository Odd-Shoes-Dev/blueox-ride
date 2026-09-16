-- Add Car Details to Rides Migration
-- Run this in Supabase Dashboard -> SQL Editor

-- =====================
-- ADD CAR DETAILS COLUMNS TO RIDES TABLE
-- =====================
-- Add car brand, model, and year for easy vehicle identification

ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS car_brand TEXT,
ADD COLUMN IF NOT EXISTS car_model TEXT,
ADD COLUMN IF NOT EXISTS car_year INTEGER CHECK (car_year >= 1990 AND car_year <= 2100);

-- =====================
-- UPDATE RIDES_WITH_DRIVER VIEW
-- =====================
-- Recreate view to include car details

DROP VIEW IF EXISTS public.rides_with_driver;
CREATE OR REPLACE VIEW public.rides_with_driver AS
SELECT
  r.*,
  u.full_name as driver_name,
  u.avatar_url as driver_avatar,
  u.average_rating as driver_rating,
  u.total_rides as driver_total_rides,
  u.phone_number as driver_phone,
  cp.photo_url as car_photo_url
FROM public.rides r
JOIN public.users u ON r.driver_id = u.id
LEFT JOIN public.car_photos cp ON r.car_photo_id = cp.id;

-- Grant access to view
GRANT SELECT ON public.rides_with_driver TO authenticated;
GRANT SELECT ON public.rides_with_driver TO anon;

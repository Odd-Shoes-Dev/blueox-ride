-- Car Photos Feature Migration
-- Run this in Supabase Dashboard -> SQL Editor

-- =====================
-- CAR PHOTOS TABLE
-- =====================
-- Stores car photos that drivers can attach to their rides

CREATE TABLE IF NOT EXISTS public.car_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_car_photos_driver ON public.car_photos(driver_id);

-- Enable RLS
ALTER TABLE public.car_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for car_photos
-- Anyone can view car photos
CREATE POLICY "Car photos are viewable by everyone"
  ON public.car_photos FOR SELECT
  USING (true);

-- Drivers can insert their own car photos
CREATE POLICY "Users can insert own car photos"
  ON public.car_photos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_id);

-- Drivers can update their own car photos
CREATE POLICY "Users can update own car photos"
  ON public.car_photos FOR UPDATE
  TO authenticated
  USING (auth.uid() = driver_id);

-- Drivers can delete their own car photos
CREATE POLICY "Users can delete own car photos"
  ON public.car_photos FOR DELETE
  TO authenticated
  USING (auth.uid() = driver_id);

-- =====================
-- ADD CAR_PHOTO_ID TO RIDES
-- =====================
-- Optional: Link a primary car photo to a ride

ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS car_photo_id UUID REFERENCES public.car_photos(id) ON DELETE SET NULL;

-- =====================
-- STORAGE BUCKET FOR CAR PHOTOS
-- =====================
-- Create bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('car-photos', 'car-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Car photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload car photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update car photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete car photos" ON storage.objects;

-- Policy: Anyone can view car photos
CREATE POLICY "Car photos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'car-photos');

-- Policy: Authenticated users can upload their own car photos
CREATE POLICY "Users can upload car photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'car-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can update their own car photos
CREATE POLICY "Users can update car photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can delete their own car photos
CREATE POLICY "Users can delete car photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================
-- UPDATE RIDES_WITH_DRIVER VIEW
-- =====================
-- Recreate view to include car photo

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

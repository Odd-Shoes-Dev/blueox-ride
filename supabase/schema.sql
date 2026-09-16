-- Blue Ox Carpooling Database Schema
-- PostgreSQL for Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- ENUM TYPES
-- =====================

CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'admin');
CREATE TYPE ride_status AS ENUM ('active', 'full', 'completed', 'cancelled');
CREATE TYPE booking_status AS ENUM (
  'pending_payment',
  'confirmed',
  'cancelled_by_passenger',
  'cancelled_by_driver',
  'completed'
);
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE payment_type AS ENUM ('booking_fee', 'refund_to_passenger', 'refund_to_driver');

-- =====================
-- USERS TABLE
-- =====================
-- Extends Supabase auth.users

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone_number TEXT,
  avatar_url TEXT,
  role user_role DEFAULT 'passenger',
  average_rating DECIMAL(2,1) CHECK (average_rating >= 1 AND average_rating <= 5),
  total_rides INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster user lookups
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- =====================
-- RIDES TABLE
-- =====================

CREATE TABLE public.rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Origin location
  origin_name TEXT NOT NULL,
  origin_lat DECIMAL(10, 8) NOT NULL,
  origin_lng DECIMAL(11, 8) NOT NULL,

  -- Destination location
  destination_name TEXT NOT NULL,
  destination_lat DECIMAL(10, 8) NOT NULL,
  destination_lng DECIMAL(11, 8) NOT NULL,

  -- Ride details
  departure_time TIMESTAMPTZ NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0), -- Price in UGX (Ugandan Shillings)
  available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
  total_seats INTEGER NOT NULL CHECK (total_seats > 0 AND total_seats <= 8),

  -- Status and metadata
  status ride_status DEFAULT 'active',
  distance_km DECIMAL(10, 2),
  duration_minutes INTEGER,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure available_seats doesn't exceed total_seats
  CONSTRAINT valid_seats CHECK (available_seats <= total_seats),
  -- Ensure departure_time is in the future (for new rides)
  CONSTRAINT valid_departure CHECK (departure_time > NOW() - INTERVAL '1 hour')
);

-- Indexes for ride searches
CREATE INDEX idx_rides_driver ON public.rides(driver_id);
CREATE INDEX idx_rides_status ON public.rides(status);
CREATE INDEX idx_rides_departure ON public.rides(departure_time);
CREATE INDEX idx_rides_origin ON public.rides(origin_lat, origin_lng);
CREATE INDEX idx_rides_destination ON public.rides(destination_lat, destination_lng);
CREATE INDEX idx_rides_active_departure ON public.rides(departure_time) WHERE status = 'active';

-- =====================
-- BOOKINGS TABLE
-- =====================

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seats_booked INTEGER NOT NULL DEFAULT 1 CHECK (seats_booked > 0 AND seats_booked <= 4),
  booking_fee INTEGER NOT NULL CHECK (booking_fee > 0), -- 10% of ride price per seat
  status booking_status DEFAULT 'pending_payment',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate bookings
  CONSTRAINT unique_passenger_ride UNIQUE (ride_id, passenger_id)
);

-- Indexes for booking lookups
CREATE INDEX idx_bookings_ride ON public.bookings(ride_id);
CREATE INDEX idx_bookings_passenger ON public.bookings(passenger_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);

-- =====================
-- PAYMENTS TABLE
-- =====================

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0), -- Amount in UGX
  payment_type payment_type NOT NULL,
  status payment_status DEFAULT 'pending',

  -- Payment provider details
  pandora_reference TEXT UNIQUE, -- Merchant reference for payment provider
  pandora_transaction_id TEXT, -- Provider order tracking / confirmation ID
  phone_number TEXT NOT NULL, -- Mobile money phone number

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payment lookups
CREATE INDEX idx_payments_booking ON public.payments(booking_id);
CREATE INDEX idx_payments_user ON public.payments(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_reference ON public.payments(pandora_reference);

-- =====================
-- REVIEWS TABLE
-- =====================

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One review per booking per reviewer
  CONSTRAINT unique_review UNIQUE (booking_id, reviewer_id),
  -- Cannot review yourself
  CONSTRAINT no_self_review CHECK (reviewer_id != reviewee_id)
);

-- Indexes for review lookups
CREATE INDEX idx_reviews_booking ON public.reviews(booking_id);
CREATE INDEX idx_reviews_reviewee ON public.reviews(reviewee_id);

-- =====================
-- FUNCTIONS
-- =====================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update available seats when booking is confirmed
CREATE OR REPLACE FUNCTION update_available_seats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    -- Decrease available seats
    UPDATE public.rides
    SET available_seats = available_seats - NEW.seats_booked
    WHERE id = NEW.ride_id;

    -- Mark ride as full if no seats left
    UPDATE public.rides
    SET status = 'full'
    WHERE id = NEW.ride_id AND available_seats = 0;

  ELSIF NEW.status IN ('cancelled_by_passenger', 'cancelled_by_driver')
        AND OLD.status = 'confirmed' THEN
    -- Restore available seats
    UPDATE public.rides
    SET available_seats = available_seats + OLD.seats_booked,
        status = 'active'
    WHERE id = NEW.ride_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update user average rating
CREATE OR REPLACE FUNCTION update_user_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET average_rating = (
    SELECT ROUND(AVG(rating)::numeric, 1)
    FROM public.reviews
    WHERE reviewee_id = NEW.reviewee_id
  )
  WHERE id = NEW.reviewee_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to increment total rides for users after completed booking
CREATE OR REPLACE FUNCTION update_total_rides()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Update passenger's total rides
    UPDATE public.users
    SET total_rides = total_rides + 1
    WHERE id = NEW.passenger_id;

    -- Update driver's total rides (get driver from ride)
    UPDATE public.users
    SET total_rides = total_rides + 1
    WHERE id = (SELECT driver_id FROM public.rides WHERE id = NEW.ride_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user creation from auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- TRIGGERS
-- =====================

-- Updated_at triggers
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rides_updated_at
  BEFORE UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Business logic triggers
CREATE TRIGGER booking_seats_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION update_available_seats();

CREATE TRIGGER review_rating_update
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_user_rating();

CREATE TRIGGER booking_completed_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION update_total_rides();

-- Auth user creation trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================
-- ROW LEVEL SECURITY (RLS)
-- =====================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES - USERS
-- =====================

-- Users can view all user profiles (for seeing driver info)
CREATE POLICY "Users are viewable by everyone"
  ON public.users FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- =====================
-- RLS POLICIES - RIDES
-- =====================

-- Anyone can view active rides
CREATE POLICY "Active rides are viewable by everyone"
  ON public.rides FOR SELECT
  USING (status IN ('active', 'full') OR driver_id = auth.uid());

-- Drivers can create rides
CREATE POLICY "Authenticated users can create rides"
  ON public.rides FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- Drivers can update their own rides
CREATE POLICY "Drivers can update own rides"
  ON public.rides FOR UPDATE
  USING (auth.uid() = driver_id);

-- Drivers can delete their own active rides
CREATE POLICY "Drivers can delete own active rides"
  ON public.rides FOR DELETE
  USING (auth.uid() = driver_id AND status = 'active');

-- =====================
-- RLS POLICIES - BOOKINGS
-- =====================

-- Users can view their own bookings (as passenger or driver of the ride)
CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT
  USING (
    passenger_id = auth.uid() OR
    ride_id IN (SELECT id FROM public.rides WHERE driver_id = auth.uid())
  );

-- Passengers can create bookings
CREATE POLICY "Passengers can create bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = passenger_id);

-- Users can update their own bookings (for cancellation)
CREATE POLICY "Users can update own bookings"
  ON public.bookings FOR UPDATE
  USING (
    passenger_id = auth.uid() OR
    ride_id IN (SELECT id FROM public.rides WHERE driver_id = auth.uid())
  );

-- =====================
-- RLS POLICIES - PAYMENTS
-- =====================

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (user_id = auth.uid());

-- Only service role can insert/update payments (via Edge Functions)
CREATE POLICY "Service role can manage payments"
  ON public.payments FOR ALL
  USING (auth.role() = 'service_role');

-- Allow authenticated users to insert payments for themselves
CREATE POLICY "Users can initiate own payments"
  ON public.payments FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =====================
-- RLS POLICIES - REVIEWS
-- =====================

-- Everyone can view reviews
CREATE POLICY "Reviews are viewable by everyone"
  ON public.reviews FOR SELECT
  USING (true);

-- Users can create reviews for completed bookings
CREATE POLICY "Users can create reviews for completed bookings"
  ON public.reviews FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid() AND
    booking_id IN (
      SELECT id FROM public.bookings
      WHERE status = 'completed' AND (
        passenger_id = auth.uid() OR
        ride_id IN (SELECT id FROM public.rides WHERE driver_id = auth.uid())
      )
    )
  );

-- =====================
-- VIEWS
-- =====================

-- View for ride search with driver info
CREATE OR REPLACE VIEW public.rides_with_driver AS
SELECT
  r.*,
  u.full_name as driver_name,
  u.avatar_url as driver_avatar,
  u.average_rating as driver_rating,
  u.total_rides as driver_total_rides,
  u.phone_number as driver_phone
FROM public.rides r
JOIN public.users u ON r.driver_id = u.id;

-- View for booking with full details
CREATE OR REPLACE VIEW public.bookings_with_details AS
SELECT
  b.*,
  r.origin_name,
  r.destination_name,
  r.departure_time,
  r.price as ride_price,
  r.status as ride_status,
  p.full_name as passenger_name,
  p.phone_number as passenger_phone,
  p.avatar_url as passenger_avatar,
  d.full_name as driver_name,
  d.phone_number as driver_phone,
  d.avatar_url as driver_avatar
FROM public.bookings b
JOIN public.rides r ON b.ride_id = r.id
JOIN public.users p ON b.passenger_id = p.id
JOIN public.users d ON r.driver_id = d.id;

-- Grant access to views
GRANT SELECT ON public.rides_with_driver TO authenticated;
GRANT SELECT ON public.bookings_with_details TO authenticated;

-- =====================
-- STORAGE BUCKETS
-- =====================
-- Run this in Supabase Dashboard -> Storage

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('avatars', 'avatars', true);

-- CREATE POLICY "Avatar images are publicly accessible"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'avatars');

-- CREATE POLICY "Users can upload their own avatar"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can update their own avatar"
--   ON storage.objects FOR UPDATE
--   USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

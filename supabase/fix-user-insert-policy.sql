-- Fix for User Profile Creation
-- Run this in Supabase Dashboard -> SQL Editor
-- This allows users to create their own profile if the trigger didn't work

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Policy: Allow authenticated users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Also, let's verify the trigger exists for auto-creating profiles
-- This will recreate it if needed

-- Drop and recreate the function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (if not exists will error silently, that's ok)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

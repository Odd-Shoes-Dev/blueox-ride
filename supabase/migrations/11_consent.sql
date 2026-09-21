-- Step 11 — Record when each user agreed to the Terms and Privacy Policy
-- Run this in Supabase Dashboard -> SQL Editor (after 10_booking_requests.sql)
--
-- Every account carries the time it agreed and WHICH version of the documents it agreed to
-- (src/domains/core/legal/legalConfig.ts -> LEGAL.consentVersion), so we can show it later
-- and ask people to agree again when the documents change in a way that matters.
--   * Email sign-ups tick the box on the form; the app sends the version with the sign-up and
--     the trigger below stores it with the new profile.
--   * Google sign-ins (and accounts that existed before this) have no record yet, so the app
--     shows a one-time "agree to continue" screen, which calls accept_terms().
-- See docs/privacy-and-consent.md.

-- =====================
-- 1. COLUMNS
-- =====================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- =====================
-- 2. SIGN-UP TRIGGER STORES THE CONSENT SENT WITH THE SIGN-UP
-- =====================
-- Same as before (profile row on sign-up), plus the consent columns. The version comes from the
-- sign-up data the form sends ("terms_version"); it is only ever present when the box was ticked.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, terms_accepted_at, terms_version)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN NULLIF(NEW.raw_user_meta_data->>'terms_version', '') IS NOT NULL THEN now() END,
    NULLIF(NEW.raw_user_meta_data->>'terms_version', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================
-- 3. AGREEING FROM THE CONSENT SCREEN
-- =====================
-- The time is taken here by the database (not sent by the app), for the signed-in user only.

CREATE OR REPLACE FUNCTION public.accept_terms(p_version TEXT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_version IS NULL OR btrim(p_version) = '' THEN
    RAISE EXCEPTION 'A version is required';
  END IF;

  UPDATE public.users
  SET terms_accepted_at = now(), terms_version = p_version
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.accept_terms(TEXT) TO authenticated;

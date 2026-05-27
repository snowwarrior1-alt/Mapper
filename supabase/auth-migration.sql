-- ⚠️  SUPERSEDED — do not run this file.
-- Its contents have been consolidated into 00-base-schema-migration.sql.
-- ============================================================
-- MapCrowd Auth Migration (original, kept for reference only)
-- ============================================================

-- 1. Profiles table — public display info, auto-populated on signup
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_profiles"   ON profiles FOR SELECT USING (true);
CREATE POLICY "user_update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. Add user_id to pins (FK → profiles so PostgREST can auto-join)
ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Trigger: auto-create a profile row whenever someone signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',        -- Google OAuth full name
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)           -- fallback: email prefix
    ),
    NEW.raw_user_meta_data->>'avatar_url'     -- Google avatar URL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Tighten pins RLS: only authenticated users may insert
DROP POLICY IF EXISTS "public_insert_pins" ON pins;

CREATE POLICY "auth_insert_pins" ON pins
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

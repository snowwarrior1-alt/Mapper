-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — Base Schema  (run this FIRST)
--
-- Consolidates: schema.sql + auth-migration.sql + community-creation-migration.sql
-- Those three files are now superseded by this one — do not run them separately.
--
-- What this creates:
--   1. profiles        — public user profiles, auto-created on sign-up via trigger
--   2. communities     — map communities (like subreddits)
--   3. pins            — geo-tagged posts inside a community
--   4. votes           — anonymous up/downvotes on pins (session-scoped)
--   5. vote_on_pin()   — RPC that casts/toggles a vote and keeps vote_count in sync
--   6. Seed communities — six starter communities so the map isn't empty
--
-- Run order for ALL migrations:
--   00-base-schema-migration.sql           ← this file
--   01-moderation-migration.sql
--   02-community-settings-migration.sql
--   03-comments-migration.sql
--   04-photos-and-community-page-migration.sql
--   05-search-profiles-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. profiles ───────────────────────────────────────────────────────────────
-- One row per authenticated user. Other tables FK here (not auth.users) so
-- PostgREST can resolve joins like profile:profiles(username, avatar_url).

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT        UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING     (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create a profile row whenever a user signs up.
-- Pulls display name from OAuth metadata; falls back to email prefix.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. communities ────────────────────────────────────────────────────────────
-- Note: require_approval / default_pin_duration / who_can_pin are added by
-- 02-community-settings-migration.sql.

CREATE TABLE IF NOT EXISTS public.communities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  slug        TEXT        UNIQUE NOT NULL,
  description TEXT        CHECK (char_length(description) <= 200),
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  icon        TEXT        NOT NULL DEFAULT '📍',
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communities_select_all"
  ON communities FOR SELECT USING (true);

-- Authenticated users can create communities (created_by must match their uid)
CREATE POLICY "communities_insert_auth"
  ON communities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "communities_delete_owner"
  ON communities FOR DELETE USING (created_by = auth.uid());

-- Note: UPDATE policy is added by 02-community-settings-migration.sql

-- Live updates so new communities appear in the sidebar without a page refresh
ALTER PUBLICATION supabase_realtime ADD TABLE communities;


-- ── 3. pins ───────────────────────────────────────────────────────────────────
-- Note: status / expires_at columns are added by 02-community-settings-migration.sql.
-- Note: DELETE policy is added by 01-moderation-migration.sql.
-- Note: INSERT policy is replaced by 02-community-settings-migration.sql with one
--       that also enforces who_can_pin. It tries to drop "pins_insert_auth", so
--       that name must match exactly.

CREATE TABLE IF NOT EXISTS public.pins (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID             NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID             REFERENCES profiles(id) ON DELETE SET NULL,
  title        TEXT             NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description  TEXT             CHECK (char_length(description) <= 500),
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  vote_count   INTEGER          NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pins_select_all"
  ON pins FOR SELECT USING (true);

-- Basic auth insert — replaced by 02-community-settings-migration.sql
-- (the name "pins_insert_auth" must match what that migration tries to drop)
CREATE POLICY "pins_insert_auth"
  ON pins FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- NOTE: No UPDATE policy is created here.
-- vote_on_pin() is SECURITY DEFINER, so it runs as the DB owner and bypasses
-- RLS entirely — it does not need an UPDATE policy.
-- Mod/owner UPDATE (for approve/reject) is added by 02-community-settings-migration.sql.

ALTER PUBLICATION supabase_realtime ADD TABLE pins;


-- ── 4. votes ─────────────────────────────────────────────────────────────────
-- Anonymous voting: one row per (pin_id, session_id). session_id is a stable
-- UUID stored in localStorage (see lib/session.ts). value: +1 or -1.
-- vote_count on pins is a cached sum kept in sync by vote_on_pin().

CREATE TABLE IF NOT EXISTS public.votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  session_id TEXT        NOT NULL,
  value      SMALLINT    NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pin_id, session_id)
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes_select_all"    ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert_all"    ON votes FOR INSERT WITH CHECK (true);
CREATE POLICY "votes_update_all"    ON votes FOR UPDATE USING (true);
CREATE POLICY "votes_delete_all"    ON votes FOR DELETE USING (true);


-- ── 5. vote_on_pin() RPC ─────────────────────────────────────────────────────
-- Handles new votes, vote switches, and toggle-off (same value = remove).
-- Returns the full updated pins row; the client reads .vote_count from it.
--
-- Called from PinDetailModal:
--   supabase.rpc('vote_on_pin', { p_pin_id, p_session_id, p_value })

CREATE OR REPLACE FUNCTION public.vote_on_pin(
  p_pin_id     UUID,
  p_session_id TEXT,
  p_value      SMALLINT   -- +1 or -1
)
RETURNS public.pins       -- returns the full updated row so client can read vote_count
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_value SMALLINT;
  result_pin     public.pins;
BEGIN
  -- Check for an existing vote from this session
  SELECT value INTO existing_value
  FROM   votes
  WHERE  pin_id = p_pin_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    -- New vote
    INSERT INTO votes (pin_id, session_id, value)
    VALUES (p_pin_id, p_session_id, p_value);
    UPDATE pins SET vote_count = vote_count + p_value WHERE id = p_pin_id;

  ELSIF existing_value = p_value THEN
    -- Same vote again → toggle off (remove the vote)
    DELETE FROM votes WHERE pin_id = p_pin_id AND session_id = p_session_id;
    UPDATE pins SET vote_count = vote_count - p_value WHERE id = p_pin_id;

  ELSE
    -- Switching direction (e.g. upvote → downvote)
    UPDATE votes SET value = p_value
    WHERE  pin_id = p_pin_id AND session_id = p_session_id;
    UPDATE pins SET vote_count = vote_count + (p_value - existing_value)
    WHERE  id = p_pin_id;
  END IF;

  SELECT * INTO result_pin FROM pins WHERE id = p_pin_id;
  RETURN result_pin;
END;
$$;


-- ── 6. Seed communities ───────────────────────────────────────────────────────
-- Six starter communities so the map isn't empty on first launch.
-- created_by is NULL because these are seeded, not user-created.
-- ON CONFLICT DO NOTHING makes this safe to re-run.

INSERT INTO communities (name, slug, description, color, icon) VALUES
  ('Birds',            'birds',       'Bird sightings from fellow birders',             '#22c55e', '🐦'),
  ('Public Bathrooms', 'bathrooms',   'Clean and accessible public restrooms',          '#3b82f6', '🚻'),
  ('Vegan Spots',      'vegan',       'Vegan-friendly restaurants and cafes',           '#a855f7', '🌱'),
  ('Street Art',       'street-art',  'Murals, graffiti, and public art installations', '#f97316', '🎨'),
  ('Free WiFi',        'wifi',        'Free public WiFi hotspots',                      '#eab308', '📶'),
  ('Hiking Trails',    'hiking',      'Trail heads, scenic spots, and campgrounds',     '#78716c', '🥾')
ON CONFLICT (slug) DO NOTHING;

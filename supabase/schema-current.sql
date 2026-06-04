-- ═════════════════════════════════════════════════════════════════════════════
-- MapCrowd — Canonical Schema  (current state as of migration 20)
--
-- USE THIS FILE to set up a brand-new Supabase project from scratch.
-- It represents the fully-consolidated final state of migrations 00 – 20.
--
-- For an existing project that has already run the numbered migrations,
-- this file is reference documentation only — do NOT re-run it.
--
-- Paste into Supabase SQL Editor and run once on a fresh project.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — TABLES  (created first so functions can reference them)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One public row per auth user.  FKed from here (not auth.users) so PostgREST
-- can resolve joins like profile:profiles(username, avatar_url).

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT        UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ── communities ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.communities (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  slug                 TEXT        UNIQUE NOT NULL,
  description          TEXT        CHECK (char_length(description) <= 200),
  color                TEXT        NOT NULL DEFAULT '#6366f1'
                         CHECK (color ~ '^#[0-9a-fA-F]{3,8}$'),
  icon                 TEXT        NOT NULL DEFAULT '📍'
                         CHECK (char_length(icon) <= 32 AND icon !~ '[<>]'),
  is_private           BOOLEAN     NOT NULL DEFAULT false,
  require_approval     BOOLEAN     NOT NULL DEFAULT false,
  default_pin_duration TEXT        NOT NULL DEFAULT 'permanent',
  -- 'permanent' | '1d' | '7d' | '30d' | '90d'
  who_can_pin          TEXT        NOT NULL DEFAULT 'anyone',
  -- 'anyone' | 'subscribers' | 'mods'
  geo_restriction      JSONB       DEFAULT NULL,
  -- { name, south, north, west, east } bounding box — null means no restriction
  created_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- ── community_groups (sidebar folders) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_groups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE community_groups ENABLE ROW LEVEL SECURITY;

-- ── community_members (private-community invites & membership) ────────────────

CREATE TABLE IF NOT EXISTS public.community_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  invited_by   UUID                 REFERENCES auth.users(id)  ON DELETE SET NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- ── community_email_invites (pending invites for unregistered emails) ─────────

CREATE TABLE IF NOT EXISTS public.community_email_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  invited_by   UUID                 REFERENCES auth.users(id)  ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, email)
);

ALTER TABLE community_email_invites ENABLE ROW LEVEL SECURITY;

-- ── community_moderators ──────────────────────────────────────────────────────
-- FKs reference profiles (not auth.users) so PostgREST can join them.

CREATE TABLE IF NOT EXISTS public.community_moderators (
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  assigned_by  UUID                 REFERENCES profiles(id)    ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_moderators ENABLE ROW LEVEL SECURITY;

-- ── community_subscriptions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_subscriptions (
  community_id UUID        NOT NULL REFERENCES communities(id)    ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  group_id     UUID                 REFERENCES community_groups(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_subscriptions ENABLE ROW LEVEL SECURITY;

-- ── community_tags (mod-defined tag vocabulary) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_tags (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  created_by   UUID                 REFERENCES auth.users(id)  ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_tags_unique_name UNIQUE (community_id, name)
);

ALTER TABLE community_tags ENABLE ROW LEVEL SECURITY;

-- ── pins ──────────────────────────────────────────────────────────────────────
-- user_id is nullable to support anonymous pins in 'anyone' communities.

CREATE TABLE IF NOT EXISTS public.pins (
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   UUID             NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id        UUID             REFERENCES profiles(id) ON DELETE SET NULL,
  title          TEXT             NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description    TEXT             CHECK (char_length(description) <= 500),
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  vote_count     INTEGER          NOT NULL DEFAULT 0,
  status         TEXT             NOT NULL DEFAULT 'approved',
  -- 'pending' | 'approved' | 'rejected' — set by trigger, not the client
  expires_at     TIMESTAMPTZ,
  url            TEXT             CHECK (url IS NULL OR (char_length(url) <= 500 AND url ~* '^https?://')),
  -- Event / meetup fields; all null = regular pin
  event_date     TIMESTAMPTZ,
  event_end_date TIMESTAMPTZ,
  event_capacity INTEGER,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins REPLICA IDENTITY FULL;

-- ── pin_tags (many-to-many between pins and community_tags) ──────────────────

CREATE TABLE IF NOT EXISTS public.pin_tags (
  pin_id UUID NOT NULL REFERENCES pins(id)           ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES community_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (pin_id, tag_id)
);

ALTER TABLE pin_tags ENABLE ROW LEVEL SECURITY;

-- ── votes (anonymous up/downvotes, session-scoped) ────────────────────────────

-- Voting is authenticated + one-per-user; session_id kept for legacy/record only.
CREATE TABLE IF NOT EXISTS public.votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id)       ON DELETE CASCADE,
  user_id    UUID                 REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  value      SMALLINT    NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS votes_pin_user_uniq
  ON votes (pin_id, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- ── comments ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id)     ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FULL identity required for Realtime to filter on non-PK columns (pin_id)
ALTER TABLE comments REPLICA IDENTITY FULL;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- ── pin_photos ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pin_photos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id)     ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  caption    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pin_photos ENABLE ROW LEVEL SECURITY;

-- ── event_rsvps ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id)       ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_rsvps_unique_user UNIQUE (pin_id, user_id)
);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- ── follows (user social graph) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_no_self CHECK (follower_id <> followee_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- ── site_admins (super-users) ─────────────────────────────────────────────────
-- No RLS policies → only SECURITY DEFINER functions (is_site_admin) can read it.
-- Seed with: INSERT INTO site_admins (user_id) VALUES ('<admin-uuid>');

CREATE TABLE IF NOT EXISTS public.site_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;

-- ── saved_pins (private bookmarks) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_pins (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_id     UUID        NOT NULL REFERENCES pins(id)       ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pin_id)
);

CREATE INDEX IF NOT EXISTS saved_pins_user_idx ON saved_pins (user_id);

ALTER TABLE saved_pins ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — SHARED HELPER FUNCTIONS
-- (created before RLS policies that call them)
-- ─────────────────────────────────────────────────────────────────────────────

-- Breaks the community_members ↔ communities RLS recursion introduced in 06.
CREATE OR REPLACE FUNCTION public.check_community_member(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_community_member TO anon, authenticated;

-- Returns TRUE if the caller is a site admin (enforced everywhere via is_community_mod).
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_site_admin TO anon, authenticated;

-- Returns TRUE if the caller is a site admin, the community owner, or an assigned mod.
CREATE OR REPLACE FUNCTION public.is_community_mod(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_site_admin()
    OR EXISTS (SELECT 1 FROM communities         WHERE id           = p_community_id AND created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = p_community_id AND user_id    = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_community_mod TO anon, authenticated;

-- Returns TRUE if the caller is the pin's author OR a mod/owner of its community.
CREATE OR REPLACE FUNCTION public.is_pin_owner_or_mod(p_pin_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pins p
    WHERE p.id = p_pin_id
      AND (p.user_id = auth.uid() OR public.is_community_mod(p.community_id))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_pin_owner_or_mod TO authenticated;

-- Checks who_can_pin; handles anonymous callers (auth.uid() may be null).
CREATE OR REPLACE FUNCTION public.can_user_pin_in_community(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_who TEXT;
BEGIN
  SELECT who_can_pin INTO v_who FROM communities WHERE id = p_community_id;
  IF v_who = 'anyone' THEN RETURN TRUE; END IF;
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF v_who = 'subscribers' THEN
    RETURN EXISTS (
      SELECT 1 FROM community_subscriptions
      WHERE community_id = p_community_id AND user_id = auth.uid()
    );
  END IF;
  -- 'mods'
  RETURN public.is_community_mod(p_community_id);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles
CREATE POLICY "profiles_select_public" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own"    ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- communities
CREATE POLICY "communities_select_public_or_member" ON communities FOR SELECT
  USING (
    is_private = false
    OR created_by = auth.uid()
    OR public.check_community_member(id)
  );
CREATE POLICY "communities_insert_auth"     ON communities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
CREATE POLICY "communities_update_by_owner" ON communities FOR UPDATE
  USING (created_by = auth.uid() OR public.is_site_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_site_admin());
CREATE POLICY "communities_delete_owner"    ON communities FOR DELETE
  USING (created_by = auth.uid() OR public.is_site_admin());

-- community_groups
CREATE POLICY "community_groups_owner" ON community_groups
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- community_members
CREATE POLICY "members_select_own"   ON community_members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "members_select_owner" ON community_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM communities WHERE id = community_id AND created_by = auth.uid()));
CREATE POLICY "members_insert_owner" ON community_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM communities WHERE id = community_id AND created_by = auth.uid()));
CREATE POLICY "members_update_accept" ON community_members FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND status = 'accepted');
CREATE POLICY "members_delete_owner" ON community_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM communities WHERE id = community_id AND created_by = auth.uid()));
CREATE POLICY "members_delete_self"  ON community_members FOR DELETE USING (auth.uid() = user_id);

-- community_email_invites
CREATE POLICY "email_invites_owner" ON community_email_invites FOR ALL
  USING     (EXISTS (SELECT 1 FROM communities WHERE id = community_id AND created_by = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM communities WHERE id = community_id AND created_by = auth.uid()));

-- community_moderators
CREATE POLICY "mods_select_all"   ON community_moderators FOR SELECT USING (true);
CREATE POLICY "mods_insert_owner" ON community_moderators FOR INSERT
  WITH CHECK (community_id IN (SELECT id FROM communities WHERE created_by = auth.uid()) OR public.is_site_admin());
CREATE POLICY "mods_delete_owner" ON community_moderators FOR DELETE
  USING (community_id IN (SELECT id FROM communities WHERE created_by = auth.uid()) OR public.is_site_admin());

-- community_subscriptions
CREATE POLICY "subs_select_own" ON community_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subs_insert_own" ON community_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subs_delete_own" ON community_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- community_tags
CREATE POLICY "community_tags_select_all"   ON community_tags FOR SELECT USING (true);
CREATE POLICY "community_tags_insert_mods"  ON community_tags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.is_community_mod(community_id));
CREATE POLICY "community_tags_delete_mods"  ON community_tags FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.is_community_mod(community_id));

-- pins
CREATE POLICY "pins_select_public_or_member" ON pins FOR SELECT
  USING (
    NOT EXISTS (SELECT 1 FROM communities WHERE id = pins.community_id AND is_private = true)
    OR EXISTS  (SELECT 1 FROM communities WHERE id = pins.community_id AND created_by = auth.uid())
    OR EXISTS  (SELECT 1 FROM community_members WHERE community_id = pins.community_id AND user_id = auth.uid() AND status = 'accepted')
  );
CREATE POLICY "pins_insert_with_permission" ON pins FOR INSERT
  WITH CHECK (
    CASE
      WHEN auth.uid() IS NOT NULL THEN
        auth.uid() = user_id AND can_user_pin_in_community(community_id)
      ELSE
        user_id IS NULL
        AND (SELECT who_can_pin FROM communities WHERE id = community_id) = 'anyone'
    END
  );
CREATE POLICY "pins_update_by_mod"         ON pins FOR UPDATE
  USING     (public.is_community_mod(community_id))
  WITH CHECK(public.is_community_mod(community_id));
CREATE POLICY "pins_delete_author_or_mod"  ON pins FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.is_community_mod(community_id)
  );

-- pin_tags
CREATE POLICY "pin_tags_select_all" ON pin_tags FOR SELECT USING (true);
CREATE POLICY "pin_tags_insert"     ON pin_tags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.is_pin_owner_or_mod(pin_id));
CREATE POLICY "pin_tags_delete"     ON pin_tags FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.is_pin_owner_or_mod(pin_id));

-- votes — all writes go through vote_on_pin() (SECURITY DEFINER); read own only
CREATE POLICY "votes_select_own" ON votes FOR SELECT USING (auth.uid() = user_id);

-- comments
CREATE POLICY "comments_select_all"          ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_auth"         ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_author_or_mod" ON comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM pins p WHERE p.id = pin_id AND public.is_community_mod(p.community_id)
    )
  );

-- pin_photos
CREATE POLICY "photos_select_all"          ON pin_photos FOR SELECT USING (true);
CREATE POLICY "photos_insert_auth"         ON pin_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "photos_delete_author_or_mod" ON pin_photos FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM pins p WHERE p.id = pin_id AND public.is_community_mod(p.community_id)
    )
  );

-- event_rsvps
CREATE POLICY "rsvps_select_all"  ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "rsvps_insert_own"  ON event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rsvps_delete_own"  ON event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- follows (public social graph; you manage only your own rows)
CREATE POLICY "follows_select_all" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete_own" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- saved_pins (private bookmarks; own rows only)
CREATE POLICY "saved_pins_select_own" ON saved_pins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_pins_insert_own" ON saved_pins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_pins_delete_own" ON saved_pins FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — BUSINESS LOGIC FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-create a profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-add private community creator as accepted member
CREATE OR REPLACE FUNCTION public.add_creator_to_private_community()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_private AND NEW.created_by IS NOT NULL THEN
    INSERT INTO community_members (community_id, user_id, invited_by, status)
    VALUES (NEW.id, NEW.created_by, NEW.created_by, 'accepted')
    ON CONFLICT (community_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_private_community_created ON communities;
CREATE TRIGGER on_private_community_created
  AFTER INSERT ON communities
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_to_private_community();

-- Convert email invites when a new user signs up
CREATE OR REPLACE FUNCTION public.convert_email_invites_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id, invited_by, status)
  SELECT ei.community_id, NEW.id, ei.invited_by, 'pending'
  FROM   public.community_email_invites ei
  WHERE  LOWER(ei.email) = LOWER(NEW.email)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  DELETE FROM public.community_email_invites WHERE LOWER(email) = LOWER(NEW.email);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_new_user_convert_email_invites ON auth.users;
CREATE TRIGGER on_new_user_convert_email_invites
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.convert_email_invites_on_signup();

-- Set pin status + expires_at from community settings (also handles geo check)
CREATE OR REPLACE FUNCTION public.set_pin_defaults_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_require_approval     BOOLEAN;
  v_default_pin_duration TEXT;
  v_geo_restriction      JSONB;
  v_outside_geo          BOOLEAN := FALSE;
BEGIN
  SELECT require_approval, default_pin_duration, geo_restriction
    INTO v_require_approval, v_default_pin_duration, v_geo_restriction
    FROM communities WHERE id = NEW.community_id;

  IF v_geo_restriction IS NOT NULL THEN
    v_outside_geo := (
      NEW.lat < (v_geo_restriction->>'south')::FLOAT OR
      NEW.lat > (v_geo_restriction->>'north')::FLOAT OR
      NEW.lng < (v_geo_restriction->>'west')::FLOAT  OR
      NEW.lng > (v_geo_restriction->>'east')::FLOAT
    );
  END IF;

  NEW.status := CASE WHEN v_require_approval OR v_outside_geo THEN 'pending' ELSE 'approved' END;

  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := CASE v_default_pin_duration
      WHEN '1d'  THEN NOW() + INTERVAL  '1 day'
      WHEN '7d'  THEN NOW() + INTERVAL  '7 days'
      WHEN '30d' THEN NOW() + INTERVAL '30 days'
      WHEN '90d' THEN NOW() + INTERVAL '90 days'
      ELSE NULL
    END;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pins_set_defaults_on_insert ON pins;
CREATE TRIGGER pins_set_defaults_on_insert
  BEFORE INSERT ON pins
  FOR EACH ROW EXECUTE FUNCTION public.set_pin_defaults_on_insert();

-- Rate limit: cap authenticated pin creation (anonymous pins aren't per-actor trackable)
CREATE OR REPLACE FUNCTION public.check_pin_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_minute INT; v_hour INT;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_minute FROM pins
   WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 minute';
  IF v_minute >= 10 THEN
    RAISE EXCEPTION 'Rate limit: too many pins in the last minute — please slow down.';
  END IF;
  SELECT COUNT(*) INTO v_hour FROM pins
   WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 hour';
  IF v_hour >= 100 THEN
    RAISE EXCEPTION 'Rate limit: too many pins in the last hour — please try again later.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pins_rate_limit ON pins;
CREATE TRIGGER pins_rate_limit BEFORE INSERT ON pins
  FOR EACH ROW EXECUTE FUNCTION public.check_pin_rate_limit();

-- Rate limit: cap follow spam
CREATE OR REPLACE FUNCTION public.check_follow_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_minute INT;
BEGIN
  SELECT COUNT(*) INTO v_minute FROM follows
   WHERE follower_id = NEW.follower_id AND created_at > NOW() - INTERVAL '1 minute';
  IF v_minute >= 30 THEN
    RAISE EXCEPTION 'Rate limit: too many follows in a short time — please slow down.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS follows_rate_limit ON follows;
CREATE TRIGGER follows_rate_limit BEFORE INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.check_follow_rate_limit();

-- Vote on a pin (toggle / switch / new); authenticated + one-per-user.
-- Keeps vote_count in sync. p_session_id kept for signature/record compatibility.
CREATE OR REPLACE FUNCTION public.vote_on_pin(
  p_pin_id     UUID,
  p_session_id TEXT,
  p_value      SMALLINT
)
RETURNS public.pins LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  existing_value SMALLINT;
  result_pin     public.pins;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'You must be signed in to vote'; END IF;
  IF p_value NOT IN (-1, 1) THEN RAISE EXCEPTION 'Invalid vote value'; END IF;

  SELECT value INTO existing_value
  FROM votes WHERE pin_id = p_pin_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO votes (pin_id, session_id, user_id, value)
      VALUES (p_pin_id, p_session_id, v_user_id, p_value);
    UPDATE pins SET vote_count = vote_count + p_value WHERE id = p_pin_id;
  ELSIF existing_value = p_value THEN
    DELETE FROM votes WHERE pin_id = p_pin_id AND user_id = v_user_id;
    UPDATE pins SET vote_count = vote_count - p_value WHERE id = p_pin_id;
  ELSE
    UPDATE votes SET value = p_value WHERE pin_id = p_pin_id AND user_id = v_user_id;
    UPDATE pins SET vote_count = vote_count + (p_value - existing_value) WHERE id = p_pin_id;
  END IF;

  SELECT * INTO result_pin FROM pins WHERE id = p_pin_id;
  RETURN result_pin;
END; $$;

-- Toggle event RSVP; enforces capacity
CREATE OR REPLACE FUNCTION public.toggle_event_rsvp(p_pin_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id  UUID    := auth.uid();
  v_exists   BOOLEAN;
  v_count    INTEGER;
  v_going    BOOLEAN;
  v_capacity INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT event_capacity INTO v_capacity FROM pins WHERE id = p_pin_id;

  SELECT EXISTS (
    SELECT 1 FROM event_rsvps WHERE pin_id = p_pin_id AND user_id = v_user_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM event_rsvps WHERE pin_id = p_pin_id AND user_id = v_user_id;
    v_going := FALSE;
  ELSE
    IF v_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_count FROM event_rsvps WHERE pin_id = p_pin_id;
      IF v_count >= v_capacity THEN RAISE EXCEPTION 'Event is full'; END IF;
    END IF;
    INSERT INTO event_rsvps (pin_id, user_id) VALUES (p_pin_id, v_user_id);
    v_going := TRUE;
  END IF;

  SELECT COUNT(*) INTO v_count FROM event_rsvps WHERE pin_id = p_pin_id;
  RETURN json_build_object('going', v_going, 'rsvp_count', v_count);
END; $$;

-- Community stats (public — bypasses RLS on subscriptions)
CREATE OR REPLACE FUNCTION public.get_community_stats(p_community_id UUID)
RETURNS TABLE (pin_count BIGINT, subscriber_count BIGINT)
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(DISTINCT CASE
      WHEN p.status = 'approved' AND (p.expires_at IS NULL OR p.expires_at > NOW())
      THEN p.id END)          AS pin_count,
    COUNT(DISTINCT cs.user_id) AS subscriber_count
  FROM communities c
  LEFT JOIN pins p                  ON p.community_id  = c.id
  LEFT JOIN community_subscriptions cs ON cs.community_id = c.id
  WHERE c.id = p_community_id
  GROUP BY c.id;
$$;

-- Profile stats (public — bypasses RLS on pins)
CREATE OR REPLACE FUNCTION public.get_profile_stats(p_user_id UUID)
RETURNS TABLE (pin_count BIGINT, total_votes BIGINT, community_count BIGINT)
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)::BIGINT                     AS pin_count,
    COALESCE(SUM(vote_count), 0)::BIGINT AS total_votes,
    COUNT(DISTINCT community_id)::BIGINT  AS community_count
  FROM pins
  WHERE user_id = p_user_id
    AND status = 'approved'
    AND (expires_at IS NULL OR expires_at > NOW());
$$;

-- Find a profile by email (SECURITY DEFINER to read auth.users; server-side only)
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email TEXT)
RETURNS TABLE (user_id UUID, username TEXT, avatar_url TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id AS user_id, p.username, p.avatar_url
  FROM   public.profiles p
  JOIN   auth.users      u ON u.id = p.id
  WHERE  LOWER(u.email) = LOWER(p_email)
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.find_profile_by_email TO service_role;

-- Rename community (owner or mod only)
CREATE OR REPLACE FUNCTION public.rename_community(p_community_id UUID, p_new_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF char_length(trim(p_new_name)) < 1 OR char_length(trim(p_new_name)) > 50 THEN
    RAISE EXCEPTION 'Community name must be between 1 and 50 characters';
  END IF;
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to rename this community';
  END IF;
  UPDATE communities SET name = trim(p_new_name) WHERE id = p_community_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.rename_community TO authenticated;

-- Edit a pin (author or community mod/admin) — title / description / url only
CREATE OR REPLACE FUNCTION public.update_pin(
  p_pin_id UUID, p_title TEXT, p_description TEXT, p_url TEXT
)
RETURNS public.pins LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result_pin public.pins;
BEGIN
  IF NOT public.is_pin_owner_or_mod(p_pin_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this pin';
  END IF;
  IF char_length(trim(p_title)) < 1 OR char_length(trim(p_title)) > 100 THEN
    RAISE EXCEPTION 'Title must be between 1 and 100 characters';
  END IF;
  IF p_url IS NOT NULL AND trim(p_url) <> '' AND trim(p_url) !~* '^https?://' THEN
    RAISE EXCEPTION 'Links must start with http:// or https://';
  END IF;
  UPDATE pins SET
    title       = trim(p_title),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    url         = NULLIF(trim(COALESCE(p_url, '')), '')
  WHERE id = p_pin_id
  RETURNING * INTO result_pin;
  RETURN result_pin;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_pin TO authenticated;

-- Add moderator by email (owner or mod only; reads auth.users)
CREATE OR REPLACE FUNCTION public.add_mod_by_email(p_community_id UUID, p_email TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
BEGIN
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to add moderators to this community';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN RETURN json_build_object('found', false); END IF;

  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

  INSERT INTO community_moderators (community_id, user_id, assigned_by)
  VALUES (p_community_id, v_user_id, auth.uid())
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN json_build_object('found', true, 'user_id', v_user_id::text, 'username', v_username);
END; $$;

GRANT EXECUTE ON FUNCTION public.add_mod_by_email TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pins_title_search
  ON pins USING gin(to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_pins_description_search
  ON pins USING gin(to_tsvector('english', coalesce(description, '')));

CREATE INDEX IF NOT EXISTS idx_pins_status_expires
  ON pins (status, expires_at);

CREATE INDEX IF NOT EXISTS community_tags_community_idx ON community_tags (community_id);
CREATE INDEX IF NOT EXISTS pin_tags_tag_idx             ON pin_tags (tag_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx         ON follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_followee_idx         ON follows (followee_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — REALTIME
-- ─────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE communities;
ALTER PUBLICATION supabase_realtime ADD TABLE pins;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE community_moderators;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — STORAGE  (pin photo uploads)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('pin-photos', 'pin-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_photos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'pin-photos');

CREATE POLICY "storage_photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pin-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_photos_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pin-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — SEED DATA  (starter communities)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO communities (name, slug, description, color, icon) VALUES
  ('Birds',            'birds',      'Bird sightings from fellow birders',             '#22c55e', '🐦'),
  ('Public Bathrooms', 'bathrooms',  'Clean and accessible public restrooms',          '#3b82f6', '🚻'),
  ('Vegan Spots',      'vegan',      'Vegan-friendly restaurants and cafes',           '#a855f7', '🌱'),
  ('Street Art',       'street-art', 'Murals, graffiti, and public art installations', '#f97316', '🎨'),
  ('Free WiFi',        'wifi',       'Free public WiFi hotspots',                      '#eab308', '📶'),
  ('Hiking Trails',    'hiking',     'Trail heads, scenic spots, and campgrounds',     '#78716c', '🥾')
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 01 · Moderation & Subscriptions
-- Run AFTER 00-base-schema-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. community_moderators ───────────────────────────────────────────────────
-- FKs reference public.profiles (not auth.users) so PostgREST can join them.

CREATE TABLE IF NOT EXISTS community_moderators (
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  assigned_by  UUID                 REFERENCES profiles(id)    ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_moderators ENABLE ROW LEVEL SECURITY;

-- Anyone can read the mod list (e.g. to show ⚙ on the sidebar)
CREATE POLICY "mods_select_all"
  ON community_moderators FOR SELECT USING (true);

-- Only the community owner can assign mods
CREATE POLICY "mods_insert_owner"
  ON community_moderators FOR INSERT
  WITH CHECK (
    community_id IN (SELECT id FROM communities WHERE created_by = auth.uid())
  );

-- Only the community owner can remove mods
CREATE POLICY "mods_delete_owner"
  ON community_moderators FOR DELETE USING (
    community_id IN (SELECT id FROM communities WHERE created_by = auth.uid())
  );

-- ── 2. community_subscriptions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_subscriptions (
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own subscriptions
CREATE POLICY "subs_select_own"
  ON community_subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "subs_insert_own"
  ON community_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subs_delete_own"
  ON community_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- ── 3. Pin deletion — owners, mods, and the pin's own author ─────────────────
-- (Insert/Select policies already exist from auth-migration.sql)

CREATE POLICY "pins_delete_author_or_mod"
  ON pins FOR DELETE USING (
    -- pin author can always delete their own pin
    auth.uid() = user_id
    OR
    -- community owner can delete any pin in their community
    community_id IN (
      SELECT id FROM communities WHERE created_by = auth.uid()
    )
    OR
    -- assigned moderators can delete pins in moderated communities
    community_id IN (
      SELECT community_id FROM community_moderators WHERE user_id = auth.uid()
    )
  );

-- ── 4. Profiles must be publicly readable (for mod-search UI) ────────────────
-- If this policy already exists from auth-migration.sql, this will error —
-- that is fine; just skip this statement.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_select_public'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_select_public ON profiles FOR SELECT USING (true)';
  END IF;
END;
$$;

-- ── 5. Realtime ───────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE community_moderators;

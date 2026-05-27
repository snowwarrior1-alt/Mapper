-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 03 · Comments
-- Run AFTER 02-community-settings-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id)     ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REPLICA IDENTITY FULL is required so Realtime can filter on pin_id (non-PK column)
ALTER TABLE comments REPLICA IDENTITY FULL;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments on approved pins
CREATE POLICY "comments_select_all" ON comments FOR SELECT USING (true);

-- Authenticated users can post comments (user_id must match their auth id)
CREATE POLICY "comments_insert_auth" ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comment authors, community owners, and mods can delete comments
CREATE POLICY "comments_delete_author_or_mod" ON comments FOR DELETE USING (
  auth.uid() = user_id
  OR pin_id IN (
    SELECT p.id FROM pins p
    JOIN communities c ON c.id = p.community_id
    WHERE c.created_by = auth.uid()
  )
  OR pin_id IN (
    SELECT p.id FROM pins p
    JOIN community_moderators cm ON cm.community_id = p.community_id
    WHERE cm.user_id = auth.uid()
  )
);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

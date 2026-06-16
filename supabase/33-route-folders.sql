-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 33 · Route folders
--
-- Collapsible folders to organise the sidebar's Routes list (mirrors
-- community_groups). A route's folder_id is nullable — NULL = ungrouped.
-- Owner-only, like routes themselves.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.route_folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE route_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS route_folders_owner ON route_folders;
CREATE POLICY route_folders_owner ON route_folders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE routes ADD COLUMN IF NOT EXISTS folder_id UUID
  REFERENCES route_folders(id) ON DELETE SET NULL;

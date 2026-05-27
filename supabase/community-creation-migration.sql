-- ⚠️  SUPERSEDED — do not run this file.
-- Its contents have been consolidated into 00-base-schema-migration.sql.
-- ============================================================
-- MapCrowd Community Creation Migration (original, kept for reference only)
-- ============================================================

-- 1. Track who created each community (nullable — seeded rows have NULL)
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Allow authenticated users to create communities
--    RLS checks that created_by equals the caller's auth.uid()
CREATE POLICY "auth_insert_communities" ON communities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- 3. Live updates for the sidebar (new boards appear without refresh)
ALTER PUBLICATION supabase_realtime ADD TABLE communities;

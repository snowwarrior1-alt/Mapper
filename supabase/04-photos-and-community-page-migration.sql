-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 04 · Photos + Community page stats
-- Run AFTER 03-comments-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. pin_photos table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pin_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      UUID        NOT NULL REFERENCES pins(id)     ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,   -- public storage URL (stable for the bucket's lifetime)
  caption     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pin_photos ENABLE ROW LEVEL SECURITY;

-- Anyone can view photos
CREATE POLICY "photos_select_all" ON pin_photos FOR SELECT USING (true);

-- Authenticated users can upload photos to their own pins
CREATE POLICY "photos_insert_auth" ON pin_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Photo author, community owner, and mods can delete photos
CREATE POLICY "photos_delete_author_or_mod" ON pin_photos FOR DELETE USING (
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

-- ── 2. Supabase Storage bucket + policies ─────────────────────────────────────
-- Create the public bucket for pin photos

INSERT INTO storage.buckets (id, name, public)
VALUES ('pin-photos', 'pin-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view photos (bucket is public anyway, but explicit RLS is good practice)
CREATE POLICY "storage_photos_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'pin-photos');

-- Authenticated users can upload
-- Path convention: {userId}/{pinId}/{filename}
-- The first path segment is the uploader's user ID.
CREATE POLICY "storage_photos_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'pin-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can only delete their own uploads
CREATE POLICY "storage_photos_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'pin-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ── 3. Community page stats RPC ───────────────────────────────────────────────
-- Returns public stats for a community regardless of RLS on subscriptions.

CREATE OR REPLACE FUNCTION get_community_stats(p_community_id UUID)
RETURNS TABLE (pin_count BIGINT, subscriber_count BIGINT)
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT
    COUNT(DISTINCT CASE
      WHEN p.status = 'approved'
        AND (p.expires_at IS NULL OR p.expires_at > NOW())
      THEN p.id END) AS pin_count,
    COUNT(DISTINCT cs.user_id) AS subscriber_count
  FROM communities c
  LEFT JOIN pins p  ON p.community_id = c.id
  LEFT JOIN community_subscriptions cs ON cs.community_id = c.id
  WHERE c.id = p_community_id
  GROUP BY c.id;
$$;

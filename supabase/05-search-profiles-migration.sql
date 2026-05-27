-- ── MapCrowd — 05 · Search indexes + Profile stats ───────────────────────────
-- Run AFTER 04-photos-and-community-page-migration.sql
--
-- What this does:
--   1. Adds GIN full-text search indexes on pins for faster ILIKE queries
--   2. Creates get_profile_stats() RPC for public profile pages
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. GIN indexes for fast text search on pin title and description
--    These power the search modal's Supabase ILIKE queries.
CREATE INDEX IF NOT EXISTS idx_pins_title_search
  ON pins USING gin(to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_pins_description_search
  ON pins USING gin(to_tsvector('english', coalesce(description, '')));

-- Regular btree index on status + expires_at (used in every pin query)
CREATE INDEX IF NOT EXISTS idx_pins_status_expires
  ON pins (status, expires_at);

-- 2. Profile stats RPC — returns public stats for a user's profile page.
--    SECURITY DEFINER so it can count pins regardless of RLS on pins.
CREATE OR REPLACE FUNCTION get_profile_stats(p_user_id UUID)
RETURNS TABLE(pin_count BIGINT, total_votes BIGINT, community_count BIGINT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT                    AS pin_count,
    COALESCE(SUM(vote_count), 0)::BIGINT AS total_votes,
    COUNT(DISTINCT community_id)::BIGINT AS community_count
  FROM pins
  WHERE user_id = p_user_id
    AND status   = 'approved'
    AND (expires_at IS NULL OR expires_at > NOW());
$$;

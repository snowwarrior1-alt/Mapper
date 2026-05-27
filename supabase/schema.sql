-- ⚠️  SUPERSEDED — do not run this file.
-- Its contents have been consolidated into 00-base-schema-migration.sql.
-- ============================================================
-- MapCrowd – Supabase schema (original, kept for reference only)
-- ============================================================

-- Communities (the "subreddits" of the map)
CREATE TABLE communities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        UNIQUE NOT NULL,
  description TEXT,
  color       TEXT        NOT NULL,   -- hex color, e.g. "#22c55e"
  icon        TEXT        NOT NULL,   -- emoji
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pins (geo-tagged posts)
CREATE TABLE pins (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID             NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title        TEXT             NOT NULL,
  description  TEXT,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  vote_count   INTEGER          NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ      DEFAULT NOW()
);

-- Votes (anonymous, session-scoped)
CREATE TABLE votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id     UUID        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  session_id TEXT        NOT NULL,
  value      INTEGER     NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pin_id, session_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins        ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes       ENABLE ROW LEVEL SECURITY;

-- Everyone can read everything
CREATE POLICY "public_read_communities" ON communities FOR SELECT USING (true);
CREATE POLICY "public_read_pins"        ON pins        FOR SELECT USING (true);
CREATE POLICY "public_read_votes"       ON votes       FOR SELECT USING (true);

-- Anyone can drop a pin
CREATE POLICY "public_insert_pins" ON pins FOR INSERT WITH CHECK (true);

-- Anyone can vote (insert/update/delete their own vote)
CREATE POLICY "public_insert_votes" ON votes FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_votes" ON votes FOR UPDATE USING (true);
CREATE POLICY "public_delete_votes" ON votes FOR DELETE USING (true);

-- vote_on_pin RPC needs to update vote_count
CREATE POLICY "public_update_pin_vote_count" ON pins FOR UPDATE USING (true);

-- ============================================================
-- Realtime
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pins;

-- ============================================================
-- Voting stored procedure
-- Handles toggle (same vote = remove), switch, and new votes.
-- Returns the updated pins row.
-- ============================================================

CREATE OR REPLACE FUNCTION vote_on_pin(
  p_pin_id     UUID,
  p_session_id TEXT,
  p_value      INTEGER
)
RETURNS pins
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_vote INTEGER;
  result_pin    pins;
BEGIN
  SELECT value INTO existing_vote
  FROM   votes
  WHERE  pin_id = p_pin_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    -- New vote
    INSERT INTO votes (pin_id, session_id, value)
    VALUES (p_pin_id, p_session_id, p_value);
    UPDATE pins SET vote_count = vote_count + p_value WHERE id = p_pin_id;

  ELSIF existing_vote = p_value THEN
    -- Same vote again → toggle off
    DELETE FROM votes WHERE pin_id = p_pin_id AND session_id = p_session_id;
    UPDATE pins SET vote_count = vote_count - p_value WHERE id = p_pin_id;

  ELSE
    -- Switching vote direction
    UPDATE votes SET value = p_value
    WHERE  pin_id = p_pin_id AND session_id = p_session_id;
    UPDATE pins SET vote_count = vote_count + (p_value - existing_vote)
    WHERE  id = p_pin_id;
  END IF;

  SELECT * INTO result_pin FROM pins WHERE id = p_pin_id;
  RETURN result_pin;
END;
$$;

-- ============================================================
-- Seed communities
-- ============================================================

INSERT INTO communities (name, slug, description, color, icon) VALUES
  ('Birds',            'birds',       'Bird sightings from fellow birders',             '#22c55e', '🐦'),
  ('Public Bathrooms', 'bathrooms',   'Clean and accessible public restrooms',           '#3b82f6', '🚻'),
  ('Vegan Spots',      'vegan',       'Vegan-friendly restaurants and cafes',            '#a855f7', '🌱'),
  ('Street Art',       'street-art',  'Murals, graffiti, and public art installations',  '#f97316', '🎨'),
  ('Free WiFi',        'wifi',        'Free public WiFi hotspots',                       '#eab308', '📶'),
  ('Hiking Trails',    'hiking',      'Trail heads, scenic spots, and campgrounds',      '#78716c', '🥾');

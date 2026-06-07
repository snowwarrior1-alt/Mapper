-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 27 · Named collections
-- User-curated named lists of pins, spanning any community. A pin can live in
-- many collections. Private to the owner (sharing can be added later).
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.collections (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS collections_user_idx ON collections (user_id);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_select_own" ON collections;
CREATE POLICY "collections_select_own" ON collections
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "collections_insert_own" ON collections;
CREATE POLICY "collections_insert_own" ON collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "collections_update_own" ON collections;
CREATE POLICY "collections_update_own" ON collections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "collections_delete_own" ON collections;
CREATE POLICY "collections_delete_own" ON collections
  FOR DELETE USING (auth.uid() = user_id);

-- ── collection_pins (membership; a pin can be in many collections) ────────────

CREATE TABLE IF NOT EXISTS public.collection_pins (
  collection_id UUID        NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  pin_id        UUID        NOT NULL REFERENCES pins(id)        ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, pin_id)
);

CREATE INDEX IF NOT EXISTS collection_pins_pin_idx ON collection_pins (pin_id);

ALTER TABLE collection_pins ENABLE ROW LEVEL SECURITY;

-- You may read/manage membership rows only for collections you own.
DROP POLICY IF EXISTS "collection_pins_select_own" ON collection_pins;
CREATE POLICY "collection_pins_select_own" ON collection_pins
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "collection_pins_insert_own" ON collection_pins;
CREATE POLICY "collection_pins_insert_own" ON collection_pins
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "collection_pins_delete_own" ON collection_pins;
CREATE POLICY "collection_pins_delete_own" ON collection_pins
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );

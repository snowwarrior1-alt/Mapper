-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 25 · Saved pins (personal bookmarks)
-- A private per-user list of saved pins, spanning any community.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_pins (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_id     UUID        NOT NULL REFERENCES pins(id)       ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pin_id)
);

CREATE INDEX IF NOT EXISTS saved_pins_user_idx ON saved_pins (user_id);

ALTER TABLE saved_pins ENABLE ROW LEVEL SECURITY;

-- Private: a user only ever sees / manages their own saves.
DROP POLICY IF EXISTS "saved_pins_select_own" ON saved_pins;
CREATE POLICY "saved_pins_select_own" ON saved_pins
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_pins_insert_own" ON saved_pins;
CREATE POLICY "saved_pins_insert_own" ON saved_pins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_pins_delete_own" ON saved_pins;
CREATE POLICY "saved_pins_delete_own" ON saved_pins
  FOR DELETE USING (auth.uid() = user_id);

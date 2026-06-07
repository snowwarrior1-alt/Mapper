-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 28 · Routes / trails
-- An ordered sequence of pins (bar crawl, hike, walking tour), drawn as a
-- polyline on the map. Private to the owner (sharing can be added later).
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.routes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  color      TEXT        NOT NULL DEFAULT '#6366f1' CHECK (color ~ '^#[0-9a-fA-F]{3,8}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS routes_user_idx ON routes (user_id);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routes_select_own" ON routes;
CREATE POLICY "routes_select_own" ON routes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "routes_insert_own" ON routes;
CREATE POLICY "routes_insert_own" ON routes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "routes_update_own" ON routes;
CREATE POLICY "routes_update_own" ON routes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "routes_delete_own" ON routes;
CREATE POLICY "routes_delete_own" ON routes FOR DELETE USING (auth.uid() = user_id);

-- ── route_pins (ordered stops) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.route_pins (
  route_id   UUID        NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  pin_id     UUID        NOT NULL REFERENCES pins(id)   ON DELETE CASCADE,
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (route_id, pin_id)
);

CREATE INDEX IF NOT EXISTS route_pins_route_idx ON route_pins (route_id);

ALTER TABLE route_pins ENABLE ROW LEVEL SECURITY;

-- Manage stops only for routes you own.
DROP POLICY IF EXISTS "route_pins_select_own" ON route_pins;
CREATE POLICY "route_pins_select_own" ON route_pins FOR SELECT
  USING (EXISTS (SELECT 1 FROM routes r WHERE r.id = route_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "route_pins_insert_own" ON route_pins;
CREATE POLICY "route_pins_insert_own" ON route_pins FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM routes r WHERE r.id = route_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "route_pins_update_own" ON route_pins;
CREATE POLICY "route_pins_update_own" ON route_pins FOR UPDATE
  USING (EXISTS (SELECT 1 FROM routes r WHERE r.id = route_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "route_pins_delete_own" ON route_pins;
CREATE POLICY "route_pins_delete_own" ON route_pins FOR DELETE
  USING (EXISTS (SELECT 1 FROM routes r WHERE r.id = route_id AND r.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 30 · Public community routes
--
-- Routes stay private by default, but an owner can publish one to a community so
-- anyone can VIEW it (read-only). Reads widen to public routes; all writes stay
-- owner-only, so "publishing" is just an owner UPDATE of is_public + community_id.
--
-- Forward-compat (later phases, not in this migration):
--   • Phase 2 (real routing): routes.travel_mode + cached geometry.
--   • Phase 3 (optional stops): route_pins.step (pins sharing a step = alternatives).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS community_id UUID
  REFERENCES communities(id) ON DELETE SET NULL;

-- A public route must name the community it belongs to.
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_public_has_community;
ALTER TABLE routes ADD CONSTRAINT routes_public_has_community
  CHECK (NOT is_public OR community_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS routes_community_public_idx
  ON routes (community_id) WHERE is_public;

-- ── RLS: widen reads to public routes; writes unchanged (owner-only) ──────────
DROP POLICY IF EXISTS "routes_select_own" ON routes;
DROP POLICY IF EXISTS "routes_select" ON routes;
CREATE POLICY "routes_select" ON routes FOR SELECT
  USING (auth.uid() = user_id OR is_public);

-- route_pins are readable for routes you own OR public routes.
DROP POLICY IF EXISTS "route_pins_select_own" ON route_pins;
DROP POLICY IF EXISTS "route_pins_select" ON route_pins;
CREATE POLICY "route_pins_select" ON route_pins FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR r.is_public)
  ));

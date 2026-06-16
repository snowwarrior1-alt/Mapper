-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 31 · Real routing (street / trail following)
--
-- A route can follow roads/trails (via OpenRouteService) instead of straight
-- lines. We store the travel mode + the computed polyline so viewers (incl.
-- anonymous viewers of public routes) render the snapped path without each one
-- re-hitting the routing API. Only the owner recomputes (on stop/mode change).
--
--   travel_mode — ORS profile.
--   geometry    — cached [[lat,lng], …] snapped path (JSONB), null = not computed
--                 yet (client falls back to straight lines).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE routes ADD COLUMN IF NOT EXISTS travel_mode TEXT NOT NULL DEFAULT 'foot-walking';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS geometry JSONB;

ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_travel_mode_valid;
ALTER TABLE routes ADD CONSTRAINT routes_travel_mode_valid
  CHECK (travel_mode IN ('foot-walking', 'foot-hiking', 'cycling-regular', 'driving-car'));

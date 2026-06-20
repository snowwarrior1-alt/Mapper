-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 36 · Snapped alternatives + equal-option steps
--
-- Two changes so that a route's dashed "alternative" spurs follow streets/trails
-- (like the main path already does), and so a step's options can be presented as
-- equal choices rather than "one default + fallbacks":
--
--   route_pins.equal_options — when true, this step's incoming main leg is dashed
--     too: the previous stop fans out to ALL of this step's stops as equal dashed
--     branches, with no solid line into the step. Set on every row of the step.
--
--   routes.branch_geometry — cached snapped geometry for the DASHED legs
--     (alternative spurs + equal-step main legs), as an array of [[lat,lng], …]
--     polylines. Mirrors routes.geometry so viewers render without re-hitting ORS.
--
-- NOTE: routes.geometry now stores an ARRAY OF SEGMENTS ([[[lat,lng],…], …]) so
-- the solid path can break at equal-option steps. Legacy rows hold a single flat
-- [[lat,lng],…] polyline; the client normalises both (see lib/route-legs.ts).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE route_pins ADD COLUMN IF NOT EXISTS equal_options BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE routes ADD COLUMN IF NOT EXISTS branch_geometry JSONB;

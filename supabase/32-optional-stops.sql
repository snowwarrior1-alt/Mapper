-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 32 · Optional / branching stops
--
-- A route is a sequence of STEPS; pins that share a `step` are alternatives at
-- that step ("…then 3 or 4 or 5"). `position` orders alternatives within a step.
-- The drawn path follows a "spine" (the first pin of each step); extra
-- alternatives are dashed spurs off the previous step.
--
-- Backfill step = position so existing (linear) routes are unchanged — every pin
-- lands in its own single-pin step.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE route_pins ADD COLUMN IF NOT EXISTS step INTEGER;

-- Backfill only freshly-added rows (NULL); never clobber app-managed steps on re-run.
UPDATE route_pins SET step = position WHERE step IS NULL;

ALTER TABLE route_pins ALTER COLUMN step SET DEFAULT 0;
ALTER TABLE route_pins ALTER COLUMN step SET NOT NULL;

CREATE INDEX IF NOT EXISTS route_pins_order_idx ON route_pins (route_id, step, position);

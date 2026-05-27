-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — Reseed sample communities
--
-- Safe to run at any time. ON CONFLICT DO NOTHING means rows that already
-- exist (matched by slug) are left untouched.
--
-- Run this in Supabase SQL Editor if the starter communities are missing.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO communities (name, slug, description, color, icon, is_private)
VALUES
  ('Birds',            'birds',       'Bird sightings from fellow birders',              '#22c55e', '🐦',  false),
  ('Public Bathrooms', 'bathrooms',   'Clean and accessible public restrooms',           '#3b82f6', '🚻',  false),
  ('Vegan Spots',      'vegan',       'Vegan-friendly restaurants and cafes',            '#a855f7', '🌱',  false),
  ('Street Art',       'street-art',  'Murals, graffiti, and public art installations',  '#f97316', '🎨',  false),
  ('Free WiFi',        'wifi',        'Free public WiFi hotspots',                       '#eab308', '📶',  false),
  ('Hiking Trails',    'hiking',      'Trail heads, scenic spots, and campgrounds',      '#78716c', '🥾',  false)
ON CONFLICT (slug) DO NOTHING;

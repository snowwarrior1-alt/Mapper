-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 02 · Community advanced settings
-- Run AFTER 01-moderation-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Community settings columns ─────────────────────────────────────────────

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS require_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_pin_duration TEXT    NOT NULL DEFAULT 'permanent',
  -- 'permanent' | '1d' | '7d' | '30d' | '90d'
  ADD COLUMN IF NOT EXISTS who_can_pin          TEXT    NOT NULL DEFAULT 'anyone';
  -- 'anyone' | 'subscribers' | 'mods'

-- Allow community owners to update their community rows
CREATE POLICY "communities_update_by_owner" ON communities
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ── 2. Pin status + expiry columns ────────────────────────────────────────────

ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS status     TEXT        NOT NULL DEFAULT 'approved',
  -- 'pending' | 'approved' | 'rejected'
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Allow mods / owners to approve, reject, or edit pins in their communities
CREATE POLICY "pins_update_by_mod" ON pins
  FOR UPDATE
  USING (
    community_id IN (SELECT id FROM communities WHERE created_by = auth.uid())
    OR community_id IN (SELECT community_id FROM community_moderators WHERE user_id = auth.uid())
  )
  WITH CHECK (
    community_id IN (SELECT id FROM communities WHERE created_by = auth.uid())
    OR community_id IN (SELECT community_id FROM community_moderators WHERE user_id = auth.uid())
  );

-- ── 3. Server-side who_can_pin enforcement ─────────────────────────────────────

CREATE OR REPLACE FUNCTION can_user_pin_in_community(p_community_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_who TEXT;
BEGIN
  SELECT who_can_pin INTO v_who FROM communities WHERE id = p_community_id;
  IF v_who = 'anyone' THEN RETURN TRUE; END IF;
  IF v_who = 'subscribers' THEN
    RETURN EXISTS (
      SELECT 1 FROM community_subscriptions
      WHERE community_id = p_community_id AND user_id = auth.uid()
    );
  END IF;
  -- 'mods': owner or assigned mod
  RETURN
    EXISTS (SELECT 1 FROM communities WHERE id = p_community_id AND created_by = auth.uid())
    OR
    EXISTS (SELECT 1 FROM community_moderators WHERE community_id = p_community_id AND user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old INSERT policy (try the most common name; adjust if yours differs)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can insert pins" ON pins;
  DROP POLICY IF EXISTS "authenticated_can_insert_pins"      ON pins;
  DROP POLICY IF EXISTS "Users can insert pins"              ON pins;
  DROP POLICY IF EXISTS "pins_insert_auth"                   ON pins;
  DROP POLICY IF EXISTS "pins_insert_authenticated"          ON pins;
END;
$$;

-- New INSERT policy that also checks who_can_pin
CREATE POLICY "pins_insert_with_permission" ON pins
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND can_user_pin_in_community(community_id)
  );

-- ── 4. Trigger: auto-set status + expires_at from community settings ───────────
-- The client no longer needs to send these; the server always enforces them.

CREATE OR REPLACE FUNCTION set_pin_defaults_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_require_approval     BOOLEAN;
  v_default_pin_duration TEXT;
BEGIN
  SELECT require_approval, default_pin_duration
    INTO v_require_approval, v_default_pin_duration
    FROM communities WHERE id = NEW.community_id;

  -- Always override status based on community rule (client cannot bypass this)
  NEW.status := CASE WHEN v_require_approval THEN 'pending' ELSE 'approved' END;

  -- Set expiry unless the client explicitly provided one (override = allowed for future use)
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := CASE v_default_pin_duration
      WHEN '1d'  THEN NOW() + INTERVAL  '1 day'
      WHEN '7d'  THEN NOW() + INTERVAL  '7 days'
      WHEN '30d' THEN NOW() + INTERVAL '30 days'
      WHEN '90d' THEN NOW() + INTERVAL '90 days'
      ELSE NULL -- 'permanent'
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS pins_set_defaults_on_insert ON pins;
CREATE TRIGGER pins_set_defaults_on_insert
  BEFORE INSERT ON pins
  FOR EACH ROW EXECUTE FUNCTION set_pin_defaults_on_insert();

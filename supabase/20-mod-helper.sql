-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd — 20 · Shared mod-permission helpers
--
-- The pattern:
--   EXISTS (SELECT 1 FROM communities WHERE id = X AND created_by = auth.uid())
--   OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = X AND user_id = auth.uid())
-- is copy-pasted across 8+ policies. This migration introduces two reusable
-- SECURITY DEFINER functions and rebuilds all affected policies and functions.
--
-- Safe to re-run (CREATE OR REPLACE + DROP POLICY IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. is_community_mod(community_id) ────────────────────────────────────────
-- Returns TRUE if the calling user is the community owner or an assigned mod.
-- SECURITY DEFINER so it bypasses RLS on both tables it reads.

CREATE OR REPLACE FUNCTION public.is_community_mod(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM communities         WHERE id           = p_community_id AND created_by   = auth.uid())
    OR EXISTS (SELECT 1 FROM community_moderators WHERE community_id = p_community_id AND user_id      = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_community_mod TO anon, authenticated;

-- ── 2. is_pin_owner_or_mod(pin_id) ───────────────────────────────────────────
-- Returns TRUE if the calling user is the pin's author OR a mod/owner of the
-- pin's community. Used by pin_tags INSERT/DELETE policies.

CREATE OR REPLACE FUNCTION public.is_pin_owner_or_mod(p_pin_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pins p
    WHERE p.id = p_pin_id
      AND (
        p.user_id = auth.uid()
        OR public.is_community_mod(p.community_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_pin_owner_or_mod TO authenticated;

-- ── 3. Rebuild community_tags policies using the helper ───────────────────────

DROP POLICY IF EXISTS "community_tags_insert_mods" ON community_tags;
DROP POLICY IF EXISTS "community_tags_delete_mods" ON community_tags;

CREATE POLICY "community_tags_insert_mods" ON community_tags
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND public.is_community_mod(community_id));

CREATE POLICY "community_tags_delete_mods" ON community_tags
  FOR DELETE USING (auth.uid() IS NOT NULL AND public.is_community_mod(community_id));

-- ── 4. Rebuild pin_tags policies using the helper ─────────────────────────────

DROP POLICY IF EXISTS "pin_tags_insert" ON pin_tags;
DROP POLICY IF EXISTS "pin_tags_delete" ON pin_tags;

CREATE POLICY "pin_tags_insert" ON pin_tags
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND public.is_pin_owner_or_mod(pin_id));

CREATE POLICY "pin_tags_delete" ON pin_tags
  FOR DELETE USING (auth.uid() IS NOT NULL AND public.is_pin_owner_or_mod(pin_id));

-- ── 5. Rebuild pins / comments / photos delete policies ───────────────────────
-- These existed before is_community_mod() and still have the verbose OR-EXISTS form.

DROP POLICY IF EXISTS "pins_delete_author_or_mod" ON pins;
CREATE POLICY "pins_delete_author_or_mod" ON pins
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.is_community_mod(community_id)
  );

DROP POLICY IF EXISTS "comments_delete_author_or_mod" ON comments;
CREATE POLICY "comments_delete_author_or_mod" ON comments
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM pins p WHERE p.id = pin_id AND public.is_community_mod(p.community_id)
    )
  );

DROP POLICY IF EXISTS "photos_delete_author_or_mod" ON pin_photos;
CREATE POLICY "photos_delete_author_or_mod" ON pin_photos
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM pins p WHERE p.id = pin_id AND public.is_community_mod(p.community_id)
    )
  );

-- ── 6. Update rename_community() and add_mod_by_email() to use the helper ─────
-- The schema-current.sql canonical versions already call is_community_mod();
-- bring the live DB functions in line.

CREATE OR REPLACE FUNCTION public.rename_community(p_community_id UUID, p_new_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF char_length(trim(p_new_name)) < 1 OR char_length(trim(p_new_name)) > 50 THEN
    RAISE EXCEPTION 'Community name must be between 1 and 50 characters';
  END IF;
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to rename this community';
  END IF;
  UPDATE communities SET name = trim(p_new_name) WHERE id = p_community_id;
END; $$;

CREATE OR REPLACE FUNCTION public.add_mod_by_email(p_community_id UUID, p_email TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
BEGIN
  IF NOT public.is_community_mod(p_community_id) THEN
    RAISE EXCEPTION 'Not authorized to add moderators to this community';
  END IF;
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN RETURN json_build_object('found', false); END IF;
  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;
  INSERT INTO community_moderators (community_id, user_id, assigned_by)
  VALUES (p_community_id, v_user_id, auth.uid())
  ON CONFLICT (community_id, user_id) DO NOTHING;
  RETURN json_build_object('found', true, 'user_id', v_user_id::text, 'username', v_username);
END; $$;

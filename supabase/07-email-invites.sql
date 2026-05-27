-- ─────────────────────────────────────────────────────────────────────────────
-- MapCrowd Migration 07 — Email-based Community Invites
--
-- Run after 06-private-communities.sql.
-- Safe to re-run (IF NOT EXISTS / DO NOTHING throughout).
--
-- What this does:
--   1. Stores invite records for not-yet-registered email addresses
--   2. Exposes find_profile_by_email() so the API route can look up existing
--      users without leaking emails to the client
--   3. Trigger: when a new user signs up, auto-convert any matching email
--      invites into pending community_members rows
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. community_email_invites ───────────────────────────────────────────────
-- Stores invites for emails that don't have a MapCrowd account yet.
-- Cleared automatically when the person signs up (trigger below).

CREATE TABLE IF NOT EXISTS public.community_email_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  invited_by   UUID                 REFERENCES auth.users(id)  ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, email)
);

ALTER TABLE community_email_invites ENABLE ROW LEVEL SECURITY;

-- Only community owners can see / manage their email invites
CREATE POLICY "email_invites_owner"
  ON community_email_invites
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_id AND created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_id AND created_by = auth.uid()
  ));


-- ── 2. find_profile_by_email() RPC ───────────────────────────────────────────
-- SECURITY DEFINER so it can JOIN into auth.users (normally off-limits to
-- the anon / authenticated roles).  Called server-side by the API route
-- using the service-role key.

CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email TEXT)
RETURNS TABLE (user_id UUID, username TEXT, avatar_url TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id AS user_id, p.username, p.avatar_url
  FROM   public.profiles p
  JOIN   auth.users      u ON u.id = p.id
  WHERE  LOWER(u.email) = LOWER(p_email)
  LIMIT  1;
$$;

-- Service role (used by the API route) can call this function
GRANT EXECUTE ON FUNCTION public.find_profile_by_email TO service_role;


-- ── 3. Auto-convert email invites on sign-up ──────────────────────────────────
-- Fires AFTER a new row is inserted in auth.users.
-- Looks for matching email invites and creates community_members rows so
-- the new user immediately sees their pending invites in the sidebar.

CREATE OR REPLACE FUNCTION public.convert_email_invites_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create pending community_members rows for every matching email invite
  INSERT INTO public.community_members (community_id, user_id, invited_by, status)
  SELECT ei.community_id, NEW.id, ei.invited_by, 'pending'
  FROM   public.community_email_invites ei
  WHERE  LOWER(ei.email) = LOWER(NEW.email)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Remove the processed email invites
  DELETE FROM public.community_email_invites
  WHERE  LOWER(email) = LOWER(NEW.email);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_user_convert_email_invites ON auth.users;
CREATE TRIGGER on_new_user_convert_email_invites
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.convert_email_invites_on_signup();

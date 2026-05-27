/**
 * POST /api/invite
 *
 * Invites a person to a private community by email.
 * Must be called by the community owner (verified via JWT).
 *
 * Flow:
 *   1. Verify caller is authenticated and is the community owner.
 *   2. Look up whether the email already has a MapCrowd account.
 *      a. Found  → create a pending community_members row (they see it in sidebar).
 *      b. Not found → store community_email_invites row + send Supabase invite email.
 *         When the person signs up, a DB trigger auto-converts the email invite.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env (server-only, never expose to client).
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('[invite] Missing Supabase env vars')
    return json({ error: 'Server misconfiguration' }, 500)
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let community_id: string, email: string
  try {
    const body = await req.json()
    community_id = body.community_id
    email        = (body.email ?? '').trim().toLowerCase()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  if (!community_id || !email || !email.includes('@')) {
    return json({ error: 'community_id and a valid email are required' }, 400)
  }

  // ── Verify the caller ───────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // Use anon client scoped to the caller's JWT — this respects RLS
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await callerClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  // ── Verify community ownership ──────────────────────────────────────────
  const { data: community, error: communityError } = await callerClient
    .from('communities')
    .select('id, name, icon, is_private, created_by')
    .eq('id', community_id)
    .single()

  if (communityError || !community) return json({ error: 'Community not found' }, 404)
  if (!community.is_private)       return json({ error: 'Community is not private' }, 400)
  if (community.created_by !== user.id) return json({ error: 'Only the owner can invite members' }, 403)

  // ── Prevent self-invite ─────────────────────────────────────────────────
  if (email === user.email?.toLowerCase()) {
    return json({ error: 'You cannot invite yourself' }, 400)
  }

  // ── Admin client — service role bypasses RLS ────────────────────────────
  const admin = createClient(supabaseUrl, serviceKey)

  // ── Look up whether the email already has an account ───────────────────
  const { data: found } = await admin
    .rpc('find_profile_by_email', { p_email: email })

  const existingProfile = Array.isArray(found) ? (found[0] ?? null) : found

  if (existingProfile?.user_id) {
    // ── Case A: existing user ─────────────────────────────────────────────
    // Create a pending community_members invite (they see it in the sidebar).
    const { error: insertError } = await admin
      .from('community_members')
      .insert({
        community_id,
        user_id:    existingProfile.user_id,
        invited_by: user.id,
        status:     'pending',
      })

    // Ignore duplicate — already invited
    if (insertError && !insertError.message.includes('duplicate') && !insertError.code?.includes('23505')) {
      console.error('[invite] insert community_members:', insertError)
      return json({ error: 'Could not create invite' }, 500)
    }

    return json({
      success:  true,
      type:     'existing_user',
      username: existingProfile.username ?? null,
    })
  }

  // ── Case B: no account yet ───────────────────────────────────────────────
  // Store an email invite row (trigger auto-converts it when they sign up)
  const { error: emailInviteError } = await admin
    .from('community_email_invites')
    .upsert(
      { community_id, email, invited_by: user.id },
      { onConflict: 'community_id,email', ignoreDuplicates: true }
    )

  if (emailInviteError) {
    console.error('[invite] upsert community_email_invites:', emailInviteError)
    return json({ error: 'Could not store email invite' }, 500)
  }

  // Derive the site URL for the redirect
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // Send Supabase's built-in invite email — this creates a magic-link so the
  // person can sign up.  On signup our DB trigger auto-adds them to the community.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl,
    data: {
      invited_to_community: community.name,
      community_icon:       community.icon,
    },
  })

  if (inviteError) {
    // Not fatal — the email_invites row is stored; they'll be auto-added on signup
    // even if the email delivery fails (e.g. address doesn't exist yet).
    console.warn('[invite] inviteUserByEmail failed (non-fatal):', inviteError.message)
  }

  return json({ success: true, type: 'new_user' })
}

'use client'

import { useState, useEffect } from 'react'
import {
  X, Shield, UserPlus, UserMinus, Search, Loader2,
  CheckCircle2, XCircle, Clock, Settings, Users, Inbox, Lock, Mail, Trash2, AlertTriangle, Globe,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDebounce } from '@/lib/hooks'
import { DEBOUNCE_MS, LIMITS } from '@/lib/constants'
import {
  Community, CommunityMember, CommunityModerator, Profile,
  PinDuration, WhoCanPin, PIN_DURATION_LABELS, WHO_CAN_PIN_LABELS,
} from '@/lib/types'
import { timeAgo } from '@/lib/utils'
import Avatar from '@/components/Avatar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingPin {
  id: string
  title: string
  description: string | null
  created_at: string
  user_id: string | null
  profile: { username: string; avatar_url: string | null } | null
}

interface CommunitySettingsModalProps {
  community: Community
  currentUserId: string
  isOwner: boolean
  isAdmin?: boolean
  onClose: () => void
  onSettingsUpdate?: (updated: Partial<Community>) => void
  onDelete?: () => void
}

type Tab = 'queue' | 'rules' | 'members' | 'mods'
type EmailInviteStatus = 'idle' | 'sending' | 'sent_existing' | 'sent_new' | 'error'

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, icon, label, badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-indigo-500 text-white'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CommunitySettingsModal({
  community,
  currentUserId,
  isOwner,
  isAdmin = false,
  onClose,
  onSettingsUpdate,
  onDelete,
}: CommunitySettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('queue')

  // ── Delete state ─────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('communities').delete().eq('id', community.id)
    setDeleting(false)
    onDelete?.()
  }

  // ── Queue state ──────────────────────────────────────────────────────────
  const [pendingPins, setPendingPins] = useState<PendingPin[]>([])
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [actingOnPin, setActingOnPin] = useState<string | null>(null)

  const fetchQueue = async () => {
    setLoadingQueue(true)
    const { data } = await supabase
      .from('pins')
      .select('id, title, description, created_at, user_id, profile:profiles(username, avatar_url)')
      .eq('community_id', community.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (data) setPendingPins(data as unknown as PendingPin[])
    setLoadingQueue(false)
  }

  useEffect(() => { fetchQueue() }, [community.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (pinId: string) => {
    setActingOnPin(pinId)
    const { error } = await supabase.from('pins').update({ status: 'approved' }).eq('id', pinId)
    if (!error) setPendingPins((prev) => prev.filter((p) => p.id !== pinId))
    setActingOnPin(null)
  }

  const handleReject = async (pinId: string) => {
    setActingOnPin(pinId)
    const { error } = await supabase.from('pins').update({ status: 'rejected' }).eq('id', pinId)
    if (!error) setPendingPins((prev) => prev.filter((p) => p.id !== pinId))
    setActingOnPin(null)
  }

  // ── Rules state ──────────────────────────────────────────────────────────
  const [requireApproval, setRequireApproval] = useState(community.require_approval)
  const [pinDuration, setPinDuration] = useState<PinDuration>(community.default_pin_duration)
  const [whoCanPin, setWhoCanPin] = useState<WhoCanPin>(community.who_can_pin)
  const [isPrivate, setIsPrivate] = useState(community.is_private)
  const [savingRules, setSavingRules] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)
  const [saveRulesError, setSaveRulesError] = useState<string | null>(null)

  const handleSaveRules = async () => {
    setSavingRules(true)
    setRulesSaved(false)
    setSaveRulesError(null)
    const updates = {
      require_approval: requireApproval,
      default_pin_duration: pinDuration,
      who_can_pin: whoCanPin,
      is_private: isPrivate,
    }
    const { error } = await supabase.from('communities').update(updates).eq('id', community.id)
    setSavingRules(false)
    if (error) {
      console.error('Failed to save community rules:', error)
      setSaveRulesError(error.message || 'Failed to save — please try again.')
    } else {
      setRulesSaved(true)
      onSettingsUpdate?.(updates)
      setTimeout(() => setRulesSaved(false), 2000)
    }
  }

  // ── Members state (private communities only) ─────────────────────────────
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<Pick<Profile, 'id' | 'username' | 'avatar_url'>[]>([])
  const [searchingMembers, setSearchingMembers] = useState(false)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  // Email invite state
  const [emailInvites, setEmailInvites] = useState<{ id: string; email: string; created_at: string }[]>([])
  const [emailInviteStatus, setEmailInviteStatus] = useState<EmailInviteStatus>('idle')
  const [emailInviteMsg, setEmailInviteMsg] = useState('')
  const [cancellingEmailId, setCancellingEmailId] = useState<string | null>(null)

  const fetchMembers = async () => {
    setLoadingMembers(true)
    const { data } = await supabase
      .from('community_members')
      .select('id, community_id, user_id, invited_by, status, created_at, profile:profiles(username, avatar_url)')
      .eq('community_id', community.id)
      .order('created_at', { ascending: true })
    if (data) setMembers(data as unknown as CommunityMember[])
    setLoadingMembers(false)
  }

  const fetchEmailInvites = async () => {
    const { data } = await supabase
      .from('community_email_invites')
      .select('id, email, created_at')
      .eq('community_id', community.id)
      .order('created_at', { ascending: true })
    if (data) setEmailInvites(data)
  }

  useEffect(() => {
    if (activeTab === 'members' && isOwner && community.is_private && loadingMembers) {
      fetchMembers()
      fetchEmailInvites()
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced member search
  const debouncedMemberSearch = useDebounce(memberSearch.trim(), DEBOUNCE_MS.userSearch)

  useEffect(() => {
    if (!debouncedMemberSearch) { setMemberSearchResults([]); return }

    let cancelled = false
    setSearchingMembers(true)
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${debouncedMemberSearch}%`)
      .limit(LIMITS.userSearchResults)
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          const excludedIds = new Set([currentUserId, ...members.map((m) => m.user_id)])
          setMemberSearchResults(data.filter((p) => !excludedIds.has(p.id)))
        }
        setSearchingMembers(false)
      })
    return () => { cancelled = true }
  }, [debouncedMemberSearch, members, currentUserId])

  const handleInviteMember = async (profile: Pick<Profile, 'id' | 'username' | 'avatar_url'>) => {
    setInvitingId(profile.id)
    const { error } = await supabase.from('community_members').insert({
      community_id: community.id,
      user_id: profile.id,
      invited_by: currentUserId,
      status: 'pending',
    })
    if (!error) {
      await fetchMembers()
      setMemberSearch('')
      setMemberSearchResults([])
    }
    setInvitingId(null)
  }

  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId)
    await supabase.from('community_members').delete().eq('id', memberId)
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    setRemovingMemberId(null)
  }

  const acceptedMembers = members.filter((m) => m.status === 'accepted' && m.user_id !== currentUserId)
  const pendingMembers  = members.filter((m) => m.status === 'pending')

  // Auto-detect email vs username in the invite input
  const isEmail = memberSearch.trim().includes('@')

  const handleEmailInvite = async () => {
    const email = memberSearch.trim()
    setEmailInviteStatus('sending')
    setEmailInviteMsg('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setEmailInviteStatus('error')
      setEmailInviteMsg('Not authenticated')
      return
    }

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ community_id: community.id, email }),
    })

    const result = await res.json()

    if (!res.ok) {
      setEmailInviteStatus('error')
      setEmailInviteMsg(result.error || 'Failed to send invite')
    } else if (result.type === 'existing_user') {
      setEmailInviteStatus('sent_existing')
      setEmailInviteMsg(`Invite sent to ${result.username ?? email}'s sidebar!`)
      await fetchMembers()
      setMemberSearch('')
    } else {
      setEmailInviteStatus('sent_new')
      setEmailInviteMsg(`Invite email sent to ${email}`)
      await fetchEmailInvites()
      setMemberSearch('')
    }

    setTimeout(() => setEmailInviteStatus('idle'), 4000)
  }

  const handleCancelEmailInvite = async (inviteId: string) => {
    setCancellingEmailId(inviteId)
    await supabase.from('community_email_invites').delete().eq('id', inviteId)
    setEmailInvites((prev) => prev.filter((i) => i.id !== inviteId))
    setCancellingEmailId(null)
  }

  // ── Mods state ───────────────────────────────────────────────────────────
  const [mods, setMods] = useState<CommunityModerator[]>([])
  const [loadingMods, setLoadingMods] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Pick<Profile, 'id' | 'username' | 'avatar_url'>[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const fetchMods = async () => {
    setLoadingMods(true)
    const { data } = await supabase
      .from('community_moderators')
      .select('community_id, user_id, profile:profiles(username, avatar_url)')
      .eq('community_id', community.id)
    if (data) setMods(data as unknown as CommunityModerator[])
    setLoadingMods(false)
  }

  useEffect(() => {
    if (activeTab === 'mods' && loadingMods) fetchMods()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced mod search
  const debouncedModSearch = useDebounce(searchQuery.trim(), DEBOUNCE_MS.userSearch)

  useEffect(() => {
    if (!debouncedModSearch) { setSearchResults([]); return }

    let cancelled = false
    setSearching(true)
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${debouncedModSearch}%`)
      .limit(LIMITS.userSearchResults)
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          const excludedIds = new Set([currentUserId, ...mods.map((m) => m.user_id)])
          setSearchResults(data.filter((p) => !excludedIds.has(p.id)))
        }
        setSearching(false)
      })
    return () => { cancelled = true }
  }, [debouncedModSearch, mods, currentUserId])

  const handleAddMod = async (profile: Pick<Profile, 'id' | 'username' | 'avatar_url'>) => {
    setAddingId(profile.id)
    const { error } = await supabase.from('community_moderators').insert({
      community_id: community.id,
      user_id: profile.id,
      assigned_by: currentUserId,
    })
    if (!error) {
      await fetchMods()
      setSearchQuery('')
      setSearchResults([])
    }
    setAddingId(null)
  }

  const handleRemoveMod = async (userId: string) => {
    setRemovingId(userId)
    const { error } = await supabase
      .from('community_moderators')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', userId)
    if (!error) setMods((prev) => prev.filter((m) => m.user_id !== userId))
    setRemovingId(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ backgroundColor: community.color + '18' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{community.icon}</span>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-white">{community.name}</h2>
                {isPrivate && (
                  <Lock className="h-3 w-3 text-gray-400" />
                )}
              </div>
              <p className="text-xs text-gray-500">{isOwner ? 'Owner' : 'Moderator'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-gray-800 bg-gray-900">
          <TabBtn
            active={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            icon={<Inbox className="h-3.5 w-3.5" />}
            label="Queue"
            badge={pendingPins.length}
          />
          {(isOwner || isAdmin) && (
            <>
              <TabBtn
                active={activeTab === 'rules'}
                onClick={() => setActiveTab('rules')}
                icon={<Settings className="h-3.5 w-3.5" />}
                label="Rules"
              />
              {community.is_private && (
                <TabBtn
                  active={activeTab === 'members'}
                  onClick={() => setActiveTab('members')}
                  icon={<Lock className="h-3.5 w-3.5" />}
                  label="Members"
                  badge={pendingMembers.length}
                />
              )}
              <TabBtn
                active={activeTab === 'mods'}
                onClick={() => setActiveTab('mods')}
                icon={<Users className="h-3.5 w-3.5" />}
                label="Mods"
              />
            </>
          )}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* ── QUEUE tab ──────────────────────────────────────────────────── */}
          {activeTab === 'queue' && (
            <div className="p-5">
              {loadingQueue ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading queue…
                </div>
              ) : pendingPins.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-600" />
                  <p className="text-sm font-medium text-gray-400">All clear!</p>
                  <p className="mt-1 text-xs text-gray-600">No pins waiting for review.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {pendingPins.map((pin) => (
                    <li
                      key={pin.id}
                      className="rounded-xl border border-gray-800 bg-gray-800/40 p-4"
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="font-semibold text-white text-sm leading-snug">{pin.title}</span>
                        <span className="shrink-0 text-xs text-gray-600">{timeAgo(pin.created_at)}</span>
                      </div>
                      {pin.description && (
                        <p className="mb-2 text-xs text-gray-500 line-clamp-2">{pin.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar
                            src={pin.profile?.avatar_url}
                            username={pin.profile?.username ?? '?'}
                            userId={pin.user_id ?? '0'}
                            className="h-5 w-5 rounded-full text-[9px]"
                            chars={1}
                          />
                          <span className="text-xs text-gray-500">
                            {pin.profile?.username ?? 'Unknown'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReject(pin.id)}
                            disabled={actingOnPin === pin.id}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-red-600/10 hover:text-red-400 disabled:opacity-40"
                          >
                            {actingOnPin === pin.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            Reject
                          </button>
                          <button
                            onClick={() => handleApprove(pin.id)}
                            disabled={actingOnPin === pin.id}
                            className="flex items-center gap-1 rounded-lg bg-green-700/20 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:bg-green-600 hover:text-white disabled:opacity-40"
                          >
                            {actingOnPin === pin.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── RULES tab ──────────────────────────────────────────────────── */}
          {activeTab === 'rules' && (
            <div className="p-5 space-y-6">

              {/* Visibility */}
              <section>
                <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Globe className="h-3.5 w-3.5" />
                  Visibility
                </h3>
                <p className="mb-3 text-xs text-gray-600">
                  Controls who can discover and view this community.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      !isPrivate
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Globe className={`h-3.5 w-3.5 ${!isPrivate ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium ${!isPrivate ? 'text-indigo-300' : 'text-gray-400'}`}>
                        Public
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">Visible to everyone</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      isPrivate
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Lock className={`h-3.5 w-3.5 ${isPrivate ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium ${isPrivate ? 'text-indigo-300' : 'text-gray-400'}`}>
                        Private
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">Invite-only</p>
                  </button>
                </div>
                {/* Warn on direction change */}
                {isPrivate !== community.is_private && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {isPrivate
                      ? 'Making this community private will hide it from non-members. Existing pins remain visible to current members.'
                      : 'Making this community public will make it visible to everyone. All pins will become publicly accessible.'}
                  </div>
                )}
              </section>

              {/* Pin lifespan */}
              <section>
                <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  Default pin lifespan
                </h3>
                <p className="mb-3 text-xs text-gray-600">
                  How long new pins live before auto-expiring.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.entries(PIN_DURATION_LABELS) as [PinDuration, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPinDuration(value)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                        pinDuration === value
                          ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Who can pin */}
              <section>
                <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Shield className="h-3.5 w-3.5" />
                  Who can drop pins
                </h3>
                <p className="mb-3 text-xs text-gray-600">
                  Restrict pinning to keep your map high-quality.
                </p>
                <div className="space-y-2">
                  {(Object.entries(WHO_CAN_PIN_LABELS) as [WhoCanPin, string][]).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        whoCanPin === value
                          ? 'border-indigo-500 bg-indigo-600/10'
                          : 'border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="who_can_pin"
                        value={value}
                        checked={whoCanPin === value}
                        onChange={() => setWhoCanPin(value)}
                        className="accent-indigo-500"
                      />
                      <span className={`text-sm font-medium ${whoCanPin === value ? 'text-indigo-300' : 'text-gray-400'}`}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              {/* Require approval */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Inbox className="h-3.5 w-3.5" />
                  Moderation
                </h3>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-800 px-4 py-3 transition-colors hover:border-gray-700">
                  <input
                    type="checkbox"
                    checked={requireApproval}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-300">Require mod approval</p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      New pins go into the Queue before appearing on the map.
                      You&apos;ll review them in the Queue tab.
                    </p>
                  </div>
                </label>
              </section>

              {/* Save button */}
              <button
                onClick={handleSaveRules}
                disabled={savingRules}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  rulesSaved
                    ? 'bg-green-700 text-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60'
                }`}
              >
                {savingRules ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </span>
                ) : rulesSaved ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Saved!
                  </span>
                ) : (
                  'Save Rules'
                )}
              </button>

              {/* Save error */}
              {saveRulesError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {saveRulesError}
                </div>
              )}

              {/* Danger Zone */}
              <section className="border-t border-red-900/40 pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Danger Zone
                </h3>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-red-800/60 bg-red-950/20 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Community
                  </button>
                ) : (
                  <div className="rounded-lg border border-red-700/50 bg-red-950/20 p-4 space-y-3">
                    <p className="text-sm font-semibold text-red-300">Are you sure?</p>
                    <p className="text-xs text-red-400/80 leading-relaxed">
                      This will permanently delete <strong className="text-red-300">{community.name}</strong> and all its pins. This cannot be undone.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                        className="flex-1 rounded-lg border border-gray-700 py-2 text-xs font-medium text-gray-400 transition-colors hover:text-gray-300 disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
                      >
                        {deleting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                        Yes, delete it
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── MEMBERS tab (private communities only) ─────────────────────── */}
          {activeTab === 'members' && (
            <div className="p-5 space-y-5">

              {/* Accepted members */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  Members
                  {acceptedMembers.length > 0 && (
                    <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-gray-400">
                      {acceptedMembers.length}
                    </span>
                  )}
                </h3>

                {loadingMembers ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : acceptedMembers.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-800 py-4 text-center text-sm text-gray-600">
                    No members yet — invite someone below
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {acceptedMembers.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-lg border border-gray-800 px-3 py-2">
                        <Avatar
                          userId={m.user_id}
                          username={m.profile?.username ?? '??'}
                          src={m.profile?.avatar_url ?? null}
                        />
                        <span className="flex-1 text-sm font-medium text-gray-200">
                          {m.profile?.username ?? 'Unknown user'}
                        </span>
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          disabled={removingMemberId === m.id}
                          className="rounded p-1 text-gray-600 transition-colors hover:text-red-400 disabled:opacity-40"
                          title="Remove member"
                        >
                          {removingMemberId === m.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <UserMinus className="h-4 w-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Pending invites — username-based + email-based */}
              {(pendingMembers.length > 0 || emailInvites.length > 0) && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    Pending Invites
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-amber-400">
                      {pendingMembers.length + emailInvites.length}
                    </span>
                  </h3>
                  <ul className="space-y-1">
                    {pendingMembers.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2">
                        <Avatar
                          userId={m.user_id}
                          username={m.profile?.username ?? '??'}
                          src={m.profile?.avatar_url ?? null}
                        />
                        <span className="flex-1 text-sm font-medium text-gray-400">
                          {m.profile?.username ?? 'Unknown user'}
                        </span>
                        <span className="text-xs text-amber-500/80">Pending</span>
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          disabled={removingMemberId === m.id}
                          className="rounded p-1 text-gray-600 transition-colors hover:text-red-400 disabled:opacity-40"
                          title="Cancel invite"
                        >
                          {removingMemberId === m.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <XCircle className="h-4 w-4" />}
                        </button>
                      </li>
                    ))}
                    {emailInvites.map((inv) => (
                      <li key={inv.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-gray-500">
                          <Mail className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-400">{inv.email}</p>
                          <p className="text-xs text-gray-600">Email invite sent</p>
                        </div>
                        <button
                          onClick={() => handleCancelEmailInvite(inv.id)}
                          disabled={cancellingEmailId === inv.id}
                          className="rounded p-1 text-gray-600 transition-colors hover:text-red-400 disabled:opacity-40"
                          title="Cancel invite"
                        >
                          {cancellingEmailId === inv.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <XCircle className="h-4 w-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Invite new member */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite Someone
                </h3>
                <div className="relative mb-2">
                  {isEmail
                    ? <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    : <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />}
                  <input
                    type="text"
                    placeholder="Username or email address…"
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value)
                      if (emailInviteStatus !== 'idle') setEmailInviteStatus('idle')
                    }}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-4 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  {(searchingMembers || emailInviteStatus === 'sending') && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500" />
                  )}
                </div>

                {/* Email invite button — shown when input looks like an email */}
                {isEmail && (
                  <div className="mb-1">
                    <button
                      onClick={handleEmailInvite}
                      disabled={emailInviteStatus === 'sending'}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {emailInviteStatus === 'sending' ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                      ) : (
                        <><Mail className="h-4 w-4" /> Send invite to {memberSearch.trim()}</>
                      )}
                    </button>
                    {emailInviteStatus !== 'idle' && emailInviteStatus !== 'sending' && (
                      <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        emailInviteStatus === 'error'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-green-500/10 text-green-400'
                      }`}>
                        {emailInviteStatus === 'error'
                          ? <XCircle className="h-4 w-4 shrink-0" />
                          : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                        {emailInviteMsg}
                      </div>
                    )}
                  </div>
                )}

                {/* Username search results */}
                {!isEmail && memberSearchResults.length > 0 && (
                  <ul className="space-y-1">
                    {memberSearchResults.map((profile) => (
                      <li key={profile.id} className="flex items-center gap-3 rounded-lg border border-gray-800 px-3 py-2 hover:border-gray-700 hover:bg-gray-800/50">
                        <Avatar userId={profile.id} username={profile.username} src={profile.avatar_url} />
                        <span className="flex-1 text-sm font-medium text-gray-200">{profile.username}</span>
                        <button
                          onClick={() => handleInviteMember(profile)}
                          disabled={invitingId === profile.id}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {invitingId === profile.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <UserPlus className="h-3.5 w-3.5" />}
                          Invite
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!isEmail && memberSearch.trim() && !searchingMembers && memberSearchResults.length === 0 && (
                  <p className="py-2 text-center text-sm text-gray-600">
                    No users found — try inviting by email instead
                  </p>
                )}
              </section>
            </div>
          )}

          {/* ── MODS tab ───────────────────────────────────────────────────── */}
          {activeTab === 'mods' && (
            <div className="p-5 space-y-5">

              {/* Current mods list */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Shield className="h-3.5 w-3.5" />
                  Moderators
                  {mods.length > 0 && (
                    <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-gray-400">
                      {mods.length}
                    </span>
                  )}
                </h3>

                {loadingMods ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : mods.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-800 py-4 text-center text-sm text-gray-600">
                    No moderators yet — add one below
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {mods.map((mod) => {
                      const isOwnerMod = mod.user_id === community.created_by
                      return (
                        <li
                          key={mod.user_id}
                          className="flex items-center gap-3 rounded-lg border border-gray-800 px-3 py-2"
                        >
                          <Avatar
                            userId={mod.user_id}
                            username={mod.profile?.username ?? '??'}
                            src={mod.profile?.avatar_url ?? null}
                          />
                          <span className="flex-1 text-sm font-medium text-gray-200">
                            {mod.profile?.username ?? 'Unknown user'}
                          </span>
                          {isOwnerMod ? (
                            <span className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                              <Shield className="h-3 w-3" />
                              Owner
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRemoveMod(mod.user_id)}
                              disabled={removingId === mod.user_id}
                              className="rounded p-1 text-gray-600 transition-colors hover:text-red-400 disabled:opacity-40"
                            >
                              {removingId === mod.user_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserMinus className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {/* Add mod search */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Moderator
                </h3>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                  <input
                    type="text"
                    placeholder="Search by username…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-4 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <ul className="space-y-1">
                    {searchResults.map((profile) => (
                      <li
                        key={profile.id}
                        className="flex items-center gap-3 rounded-lg border border-gray-800 px-3 py-2 hover:border-gray-700 hover:bg-gray-800/50"
                      >
                        <Avatar userId={profile.id} username={profile.username} src={profile.avatar_url} />
                        <span className="flex-1 text-sm font-medium text-gray-200">{profile.username}</span>
                        <button
                          onClick={() => handleAddMod(profile)}
                          disabled={addingId === profile.id}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {addingId === profile.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {searchQuery.trim() && !searching && searchResults.length === 0 && (
                  <p className="py-2 text-center text-sm text-gray-600">
                    No users found matching &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
              </section>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

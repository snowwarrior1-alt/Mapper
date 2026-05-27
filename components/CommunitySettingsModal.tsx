'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Shield, UserPlus, UserMinus, Search, Loader2,
  CheckCircle2, XCircle, Clock, Settings, Users, Inbox,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Community, CommunityModerator, Profile,
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
  onClose: () => void
  onSettingsUpdate?: (updated: Partial<Community>) => void
}

type Tab = 'queue' | 'rules' | 'mods'

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
  onClose,
  onSettingsUpdate,
}: CommunitySettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('queue')

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
  const [savingRules, setSavingRules] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)

  const handleSaveRules = async () => {
    setSavingRules(true)
    setRulesSaved(false)
    const updates = {
      require_approval: requireApproval,
      default_pin_duration: pinDuration,
      who_can_pin: whoCanPin,
    }
    const { error } = await supabase.from('communities').update(updates).eq('id', community.id)
    setSavingRules(false)
    if (!error) {
      setRulesSaved(true)
      onSettingsUpdate?.(updates)
      setTimeout(() => setRulesSaved(false), 2000)
    }
  }

  // ── Mods state ───────────────────────────────────────────────────────────
  const [mods, setMods] = useState<CommunityModerator[]>([])
  const [loadingMods, setLoadingMods] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Pick<Profile, 'id' | 'username' | 'avatar_url'>[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Debounced profile search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim()) { setSearchResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${searchQuery.trim()}%`)
        .limit(10)

      if (data) {
        const excludedIds = new Set([currentUserId, ...mods.map((m) => m.user_id)])
        setSearchResults(data.filter((p) => !excludedIds.has(p.id)))
      }
      setSearching(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, mods, currentUserId])

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
              <h2 className="text-sm font-bold text-white">{community.name}</h2>
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
          {isOwner && (
            <>
              <TabBtn
                active={activeTab === 'rules'}
                onClick={() => setActiveTab('rules')}
                icon={<Settings className="h-3.5 w-3.5" />}
                label="Rules"
              />
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
                    {mods.map((mod) => (
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
                      </li>
                    ))}
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

'use client'

import { useState } from 'react'
import {
  Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight,
  Compass, Folder, FolderPlus, LogOut, Lock, MapPin, Pencil, Plus,
  Search, Settings, Shield, Trash2, User2, ArrowUpRight, X, Users,
} from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Community, CommunityGroup, Pin, PendingInvite } from '@/lib/types'
import Avatar from '@/components/Avatar'
import FollowingPanel from '@/components/FollowingPanel'

export type { PendingInvite }

function displayName(user: User): string {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split('@')[0] ??
    'User'
  )
}

interface SidebarProps {
  communities: Community[]
  pins: Pin[]
  selectedCommunity: string | null
  showSubscribedOnly: boolean
  subscribedIds: Set<string>
  ownedCommunityIds: Set<string>
  modCommunityIds: Set<string>
  pendingInvites: PendingInvite[]
  groups: CommunityGroup[]
  communityGroupMap: Map<string, string | null>
  /** User IDs the current user follows — drives the Following feed */
  followedUserIds: Set<string>
  /** Fly to + open a pin (used by the Following feed) */
  onSelectPin: (pin: Pin) => void
  /** Which list the sidebar shows — controlled by the parent so the bottom nav can switch it */
  tab: 'communities' | 'following'
  onTabChange: (tab: 'communities' | 'following') => void
  onSelectCommunity: (id: string | null) => void
  onShowSubscribed: () => void
  onToggleSubscription: (id: string) => void
  onOpenSettings: (id: string) => void
  onAddPin: (communityId: string) => void
  onAcceptInvite: (memberId: string) => void
  onDeclineInvite: (memberId: string) => void
  onCreateGroup: (name: string) => Promise<string | null>
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onAssignGroup: (communityId: string, groupId: string | null) => void
  user: User | null
  authReady: boolean
  onSignIn: () => void
  onSignOut: () => void
  onCreateCommunity: () => void
  onOpenSearch: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  isAdmin?: boolean
}

export default function Sidebar({
  communities,
  pins,
  selectedCommunity,
  showSubscribedOnly,
  subscribedIds,
  ownedCommunityIds,
  modCommunityIds,
  pendingInvites,
  groups,
  communityGroupMap,
  followedUserIds,
  onSelectPin,
  tab,
  onTabChange,
  onSelectCommunity,
  onShowSubscribed,
  onToggleSubscription,
  onOpenSettings,
  onAddPin,
  onAcceptInvite,
  onDeclineInvite,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onAssignGroup,
  user,
  authReady,
  onSignIn,
  onSignOut,
  onCreateCommunity,
  onOpenSearch,
  mobileOpen,
  onMobileClose,
  isAdmin = false,
}: SidebarProps) {
  // ── Local UI state ──────────────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [groupPicker, setGroupPicker]         = useState<string | null>(null) // communityId
  const [pickerCreating, setPickerCreating]   = useState(false)
  const [pickerNewName, setPickerNewName]     = useState('')
  const [creatingGroup, setCreatingGroup]     = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue]         = useState('')

  // ── Helpers ─────────────────────────────────────────────────────────────
  const countFor    = (id: string) => pins.filter((p) => p.community_id === id).length
  const isOwner     = (id: string) => ownedCommunityIds.has(id)
  const isMod       = (id: string) => modCommunityIds.has(id)
  const isSubscribed= (id: string) => subscribedIds.has(id)

  // Hide pending-invite communities from the main list (shown in invite banner)
  const pendingCommunityIds = new Set(pendingInvites.map((i) => i.community_id))
  const visibleCommunities  = communities.filter((c) => !pendingCommunityIds.has(c.id))

  // ── Categorise communities into groups / ungrouped-subscribed / unsubscribed ──
  const groupedMap = new Map<string, Community[]>(groups.map((g) => [g.id, []]))
  const ungroupedSubscribed: Community[] = []
  const unsubscribedVisible: Community[] = []

  for (const c of visibleCommunities) {
    if (isSubscribed(c.id)) {
      const gid = communityGroupMap.get(c.id) ?? null
      if (gid && groupedMap.has(gid)) {
        groupedMap.get(gid)!.push(c)
      } else {
        ungroupedSubscribed.push(c)
      }
    } else {
      unsubscribedVisible.push(c)
    }
  }

  const hasSubscribedContent = groups.length > 0 || ungroupedSubscribed.length > 0

  // ── Group helpers ────────────────────────────────────────────────────────
  const toggleCollapse = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const startRename = (g: CommunityGroup) => {
    setRenamingGroupId(g.id)
    setRenameValue(g.name)
  }

  const commitRename = (id: string) => {
    const original = groups.find((g) => g.id === id)?.name
    if (renameValue.trim() && renameValue.trim() !== original) {
      onRenameGroup(id, renameValue.trim())
    }
    setRenamingGroupId(null)
  }

  const handleCreateGroupInline = async () => {
    const name = newGroupName.trim()
    setCreatingGroup(false)
    setNewGroupName('')
    if (name) await onCreateGroup(name)
  }

  const handlePickerCreate = async (communityId: string) => {
    const name = pickerNewName.trim()
    if (!name) return
    const newId = await onCreateGroup(name)
    if (newId) onAssignGroup(communityId, newId)
    setPickerNewName('')
    setPickerCreating(false)
    setGroupPicker(null)
  }

  // ── Community row renderer ───────────────────────────────────────────────
  const renderRow = (c: Community, inGroup = false) => {
    const active        = selectedCommunity === c.id
    const subscribed    = isSubscribed(c.id)
    const owner         = isOwner(c.id)
    const mod           = isMod(c.id)
    const currentGroupId= communityGroupMap.get(c.id) ?? null
    const pickerOpen    = groupPicker === c.id

    return (
      <div key={c.id} className={`group relative mb-0.5 ${inGroup ? 'pl-4' : ''}`}>
        {/* ── Main row ── */}
        <button
          onClick={() => { setGroupPicker(null); onSelectCommunity(active ? null : c.id) }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 md:py-2 text-left transition-colors ${
            active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <span
            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
            style={{ backgroundColor: c.color + '22', border: `2px solid ${c.color}` }}
          >
            {c.icon}
            {subscribed && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-gray-900 bg-yellow-400" />
            )}
          </span>

          <span className="flex-1 truncate text-sm font-medium">{c.name}</span>

          {c.is_private && <Lock className="h-3 w-3 shrink-0 text-gray-600" />}
          {(owner || mod) && (
            <Shield
              className="h-3 w-3 shrink-0"
              style={{ color: owner ? c.color : '#9ca3af' }}
              aria-label={owner ? 'You own this community' : 'You are a moderator'}
            />
          )}

          {/* Pin count — desktop only, fades on hover */}
          <span className={`hidden rounded-full px-2 py-0.5 text-xs md:inline-flex md:group-hover:opacity-0 ${
            active ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-500'
          }`}>
            {countFor(c.id)}
          </span>
        </button>

        {/* ── Mobile action strip (always visible) ── */}
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 md:hidden">
          {subscribed && user && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setPickerCreating(false); setPickerNewName('')
                setGroupPicker(pickerOpen ? null : c.id)
              }}
              title="Move to folder"
              className={`rounded-lg p-2 transition-colors ${
                currentGroupId ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <Folder className="h-4 w-4" />
            </button>
          )}
          {!c.is_private && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSubscription(c.id) }}
              title={subscribed ? 'Unsubscribe' : 'Subscribe'}
              className={`rounded-lg p-2 transition-colors ${
                subscribed ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {subscribed ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </button>
          )}
          {(owner || mod || isAdmin) && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenSettings(c.id) }}
              title="Settings"
              className={`rounded-lg p-2 transition-colors ${
                isAdmin && !owner && !mod ? 'text-red-500/60' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Desktop hover actions ── */}
        <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity md:flex md:group-hover:pointer-events-auto md:group-hover:opacity-100">
          {subscribed && user && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setPickerCreating(false); setPickerNewName('')
                setGroupPicker(pickerOpen ? null : c.id)
              }}
              title="Move to folder"
              className={`rounded p-1 transition-colors ${
                currentGroupId
                  ? 'text-indigo-400 hover:text-indigo-300'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
            </button>
          )}
          {!c.is_private && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSubscription(c.id) }}
              title={subscribed ? 'Unsubscribe' : 'Subscribe'}
              className={`rounded p-1 transition-colors ${
                subscribed ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {subscribed ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onAddPin(c.id) }}
            title="Drop a pin here"
            className="rounded p-1 text-gray-500 transition-colors hover:text-indigo-400"
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/c/${c.slug}`}
            onClick={(e) => e.stopPropagation()}
            title="View community page"
            className="rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          {(owner || mod || isAdmin) && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenSettings(c.id) }}
              title={owner ? 'Community settings' : isAdmin && !mod ? 'Admin settings' : 'Moderation queue'}
              className={`rounded p-1 transition-colors hover:text-gray-300 ${
                isAdmin && !owner && !mod ? 'text-red-500/60 hover:text-red-400' : 'text-gray-500'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Group picker (inline dropdown) ── */}
        {pickerOpen && (
          <div
            className="mx-1 mb-1 mt-0.5 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-1">
              {/* No folder option */}
              <button
                onClick={() => { onAssignGroup(c.id, null); setGroupPicker(null) }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-gray-800 ${
                  currentGroupId === null ? 'text-white' : 'text-gray-400'
                }`}
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="flex-1 text-left">No folder</span>
                {currentGroupId === null && <Check className="h-3 w-3 shrink-0 text-indigo-400" />}
              </button>

              {/* Existing folders */}
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { onAssignGroup(c.id, g.id); setGroupPicker(null) }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-gray-800 ${
                    currentGroupId === g.id ? 'text-white' : 'text-gray-400'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <span className="flex-1 truncate text-left">{g.name}</span>
                  {currentGroupId === g.id && <Check className="h-3 w-3 shrink-0 text-indigo-400" />}
                </button>
              ))}
            </div>

            {/* Create new folder from picker */}
            <div className="border-t border-gray-800">
              {!pickerCreating ? (
                <button
                  onClick={() => setPickerCreating(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
                >
                  <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                  New folder…
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <FolderPlus className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    type="text"
                    value={pickerNewName}
                    onChange={(e) => setPickerNewName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') await handlePickerCreate(c.id)
                      if (e.key === 'Escape') { setPickerCreating(false); setPickerNewName('') }
                    }}
                    placeholder="Folder name…"
                    className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-gray-600 outline-none"
                  />
                  <button
                    onClick={() => handlePickerCreate(c.id)}
                    className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1400] bg-black/60 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside className={`
        flex flex-col border-r border-gray-800 bg-gray-900
        fixed inset-y-0 left-0 z-[1401] w-72 transition-transform duration-300
        md:relative md:z-auto md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* ── Header ── */}
        <div className="border-b border-gray-800 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-base font-bold leading-none text-white">MapCrowd</h1>
              <p className="mt-0.5 text-xs text-gray-500">crowd-sourced maps</p>
            </div>
            <button
              onClick={onMobileClose}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={onOpenSearch}
            className="flex w-full items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-gray-600 hover:text-gray-300"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-600">⌘K</kbd>
          </button>

          {/* ── Communities / Following tab switcher ── */}
          <div className="mt-3 flex gap-1 rounded-lg bg-gray-800/60 p-1">
            <button
              onClick={() => onTabChange('communities')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === 'communities' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Communities
            </button>
            <button
              onClick={() => onTabChange('following')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === 'following' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Following
              {followedUserIds.size > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-400">
                  {followedUserIds.size}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Following feed ── */}
        {tab === 'following' && (
          <div className="flex-1 overflow-y-auto p-3">
            <FollowingPanel
              pins={pins}
              followedUserIds={followedUserIds}
              onSelectPin={onSelectPin}
              signedIn={!!user}
              onSignIn={onSignIn}
            />
          </div>
        )}

        {/* ── Community list ── */}
        {tab === 'communities' && (
        <div
          className="flex-1 overflow-y-auto p-3"
          onClick={() => setGroupPicker(null)}
        >
          {/* Section header */}
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Communities</p>
            {user && (
              <div className="flex items-center gap-1">
                {/* New folder button — only when user has at least one subscription */}
                {subscribedIds.size > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setCreatingGroup((v) => !v)
                      setNewGroupName('')
                    }}
                    title="New folder"
                    className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={onCreateCommunity}
                  title="Create a new community"
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Inline create-folder input */}
          {creatingGroup && (
            <div className="mb-2 px-1" onClick={(e) => e.stopPropagation()}>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') await handleCreateGroupInline()
                  if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName('') }
                }}
                onBlur={async () => {
                  if (newGroupName.trim()) await handleCreateGroupInline()
                  else setCreatingGroup(false)
                }}
                placeholder="Folder name…"
                className="w-full rounded-lg border border-indigo-500 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none"
              />
            </div>
          )}

          {/* Global filters */}
          <button
            onClick={() => { setGroupPicker(null); onSelectCommunity(null) }}
            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
              !selectedCommunity && !showSubscribedOnly
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-sm">🌍</span>
            <span className="flex-1 text-sm font-medium">All Communities</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              !selectedCommunity && !showSubscribedOnly ? 'bg-indigo-700 text-indigo-200' : 'bg-gray-800 text-gray-500'
            }`}>
              {pins.length}
            </span>
          </button>

          {user && subscribedIds.size > 0 && (
            <button
              onClick={() => { setGroupPicker(null); onShowSubscribed() }}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                showSubscribedOnly
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500/10 text-sm">⭐</span>
              <span className="flex-1 text-sm font-medium">My Subscriptions</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                showSubscribedOnly ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-800 text-gray-500'
              }`}>
                {pins.filter((p) => subscribedIds.has(p.community_id)).length}
              </span>
            </button>
          )}

          <div className="my-2 border-t border-gray-800" />

          {/* ── Group folders ── */}
          {user && groups.map((group) => {
            const collapsed  = collapsedGroups.has(group.id)
            const comms      = groupedMap.get(group.id) ?? []
            const isRenaming = renamingGroupId === group.id

            return (
              <div key={group.id} className="mb-1">
                {/* Group header */}
                <div
                  className="group/grp mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-gray-800/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => toggleCollapse(group.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                  >
                    {collapsed
                      ? <ChevronRight className="h-3 w-3 shrink-0 text-gray-600" />
                      : <ChevronDown className="h-3 w-3 shrink-0 text-gray-600" />}
                    {isRenaming ? (
                      <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(group.id)
                          if (e.key === 'Escape') setRenamingGroupId(null)
                        }}
                        onBlur={() => commitRename(group.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-transparent text-xs font-semibold uppercase tracking-wider text-gray-400 outline-none"
                      />
                    ) : (
                      <span className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {group.name}
                      </span>
                    )}
                  </button>

                  <span className="shrink-0 text-[10px] text-gray-700">{comms.length}</span>

                  {/* Rename / delete — shown on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/grp:opacity-100">
                    {!isRenaming && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(group) }}
                        title="Rename folder"
                        className="rounded p-0.5 text-gray-600 transition-colors hover:text-gray-300"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id) }}
                      title="Delete folder"
                      className="rounded p-0.5 text-gray-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Communities inside this group */}
                {!collapsed && comms.map((c) => renderRow(c, true))}

                {/* Empty folder hint */}
                {!collapsed && comms.length === 0 && (
                  <p className="py-1 pl-8 text-[10px] italic text-gray-700">
                    No communities yet
                  </p>
                )}
              </div>
            )
          })}

          {/* ── Ungrouped subscribed communities ── */}
          {user && groups.length > 0 && ungroupedSubscribed.length > 0 && (
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-700">
              Other subscriptions
            </p>
          )}
          {ungroupedSubscribed.map((c) => renderRow(c, false))}

          {/* Divider between subscribed and unsubscribed */}
          {hasSubscribedContent && unsubscribedVisible.length > 0 && (
            <div className="my-2 border-t border-gray-800" />
          )}

          {/* ── Unsubscribed / all-other communities ── */}
          {unsubscribedVisible.map((c) => renderRow(c, false))}
        </div>
        )}

        {/* ── Footer ── */}
        <div className="space-y-3 border-t border-gray-800 p-4">

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                <Lock className="h-3 w-3" />
                {pendingInvites.length === 1
                  ? '1 private map invite'
                  : `${pendingInvites.length} private map invites`}
              </p>
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{
                      backgroundColor: (invite.community?.color ?? '#6366f1') + '22',
                      border: `2px solid ${invite.community?.color ?? '#6366f1'}`,
                    }}
                  >
                    {invite.community?.icon ?? '🗺️'}
                  </span>
                  <span className="flex-1 truncate text-xs font-medium text-gray-300">
                    {invite.community?.name ?? 'Private Map'}
                  </span>
                  <button
                    onClick={() => onDeclineInvite(invite.id)}
                    title="Decline"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onAcceptInvite(invite.id)}
                    title="Accept"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-green-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Discover link */}
          <Link
            href="/discover"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            <Compass className="h-3.5 w-3.5 shrink-0" />
            Discover communities
            <ArrowUpRight className="ml-auto h-3 w-3 opacity-50" />
          </Link>

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs text-gray-500">Updates are live</span>
          </div>

          {/* User section */}
          {!authReady ? null : user ? (
            <div className="flex items-center gap-2.5">
              <Avatar
                src={user.user_metadata?.avatar_url}
                username={displayName(user)}
                userId={user.id}
                className="h-8 w-8 rounded-full text-xs ring-2 ring-gray-700"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{displayName(user)}</p>
                <p className="truncate text-xs text-gray-500">{user.email}</p>
              </div>
              <button
                onClick={onSignOut}
                title="Sign out"
                className="shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-indigo-500 hover:bg-indigo-600/10 hover:text-white"
            >
              <User2 className="h-4 w-4" />
              Sign in to drop pins
            </button>
          )}
        </div>
      </aside>
    </>
  )
}

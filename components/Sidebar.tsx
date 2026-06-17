'use client'

import { useState } from 'react'
import {
  Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight,
  Compass, Folder, FolderPlus, LogOut, Lock, MapPin, Pencil, Plus,
  Search, Settings, Shield, Trash2, User2, ArrowUpRight, X, Newspaper, Route as RouteIcon,
  Eye, EyeOff, Globe,
} from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Community, CommunityGroup, Pin, PendingInvite, Route, RouteFolder } from '@/lib/types'
import Avatar from '@/components/Avatar'
import ActivityFeed from '@/components/ActivityFeed'

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
  showSavedOnly: boolean
  savedCount: number
  /** Communities whose pins are hidden from the map (device preference) */
  hiddenCommunityIds: Set<string>
  onToggleCommunityVisibility: (id: string) => void
  /** Custom community folder currently filtering the map (null = none) */
  activeFolderId: string | null
  onSelectFolder: (id: string) => void
  routes: Route[]
  activeRouteId: string | null
  onSelectRoute: (id: string) => void
  onCreateRoute: (name: string) => Promise<Route | null>
  onDeleteRoute: (id: string) => void
  routeFolders: RouteFolder[]
  onCreateRouteFolder: (name: string) => void
  onRenameRouteFolder: (id: string, name: string) => void
  onDeleteRouteFolder: (id: string) => void
  onAssignRouteFolder: (routeId: string, folderId: string | null) => void
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
  tab: 'communities' | 'feed'
  onTabChange: (tab: 'communities' | 'feed') => void
  onSelectCommunity: (id: string | null) => void
  onShowSubscribed: () => void
  onShowSaved: () => void
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
  showSavedOnly,
  savedCount,
  hiddenCommunityIds,
  onToggleCommunityVisibility,
  activeFolderId,
  onSelectFolder,
  routes,
  activeRouteId,
  onSelectRoute,
  onCreateRoute,
  onDeleteRoute,
  routeFolders,
  onCreateRouteFolder,
  onRenameRouteFolder,
  onDeleteRouteFolder,
  onAssignRouteFolder,
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
  onShowSaved,
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // Auto-folders (All Communities / My Subscriptions / All Routes) — collapsed by default
  const [allOpen, setAllOpen] = useState(false)
  const [subsOpen, setSubsOpen] = useState(false)
  const [allRoutesOpen, setAllRoutesOpen] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  // Once the flat "discover" list gets long, tuck it into a collapsed "Other" folder.
  const OTHER_FOLDER_THRESHOLD = 8
  const [groupPicker, setGroupPicker]         = useState<string | null>(null) // communityId
  const [pickerCreating, setPickerCreating]   = useState(false)
  const [pickerNewName, setPickerNewName]     = useState('')
  const [creatingGroup, setCreatingGroup]     = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue]         = useState('')
  // Routes inline-create
  const [creatingRoute, setCreatingRoute] = useState(false)
  const [newRouteName, setNewRouteName]   = useState('')
  const submitNewRoute = async () => {
    const name = newRouteName.trim()
    setCreatingRoute(false)
    setNewRouteName('')
    if (name) {
      const r = await onCreateRoute(name)
      if (r) onSelectRoute(r.id) // open it so the user can start adding stops
    }
  }

  // Route folders — expansion (collapsed by default), create, rename, per-route move
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const submitNewFolder = () => {
    const name = newFolderName.trim()
    setCreatingFolder(false); setNewFolderName('')
    if (name) onCreateRouteFolder(name)
  }
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [folderRename, setFolderRename] = useState('')
  const [folderMenuRouteId, setFolderMenuRouteId] = useState<string | null>(null)

  const renderRouteRow = (r: Route) => (
    <div key={r.id} className="group/route relative mb-0.5">
      <div className={`flex items-center rounded-lg transition-colors ${
        activeRouteId === r.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}>
        <button onClick={() => onSelectRoute(r.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: r.color + '22', border: `2px solid ${r.color}` }}>
            <RouteIcon className="h-3.5 w-3.5" style={{ color: r.color }} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
          {r.is_public && <Globe className="h-3.5 w-3.5 shrink-0 text-green-500" aria-label="Public" />}
        </button>
        {/* Move to folder (only when folders exist) */}
        {routeFolders.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setFolderMenuRouteId((id) => (id === r.id ? null : r.id)) }}
            title="Move to folder"
            className="shrink-0 p-1 text-gray-500 transition-opacity hover:text-gray-300 md:opacity-0 md:group-hover/route:opacity-100"
          >
            <Folder className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the route “${r.name}”? This can't be undone.`)) onDeleteRoute(r.id) }}
          title="Delete route"
          className="shrink-0 p-1 pr-2 text-gray-500 transition-opacity hover:text-red-400 md:opacity-0 md:group-hover/route:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Inline "move to folder" picker (in normal flow so the scroll container never clips it) */}
      {folderMenuRouteId === r.id && (
        <div className="ml-9 mt-0.5 mb-1 rounded-lg border border-gray-700/70 bg-gray-900/60 p-1">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Move to folder…</p>
          <button onClick={() => { onAssignRouteFolder(r.id, null); setFolderMenuRouteId(null) }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
            <span className="min-w-0 flex-1 truncate text-left">No folder</span>
            {!r.folder_id && <Check className="h-3.5 w-3.5" />}
          </button>
          {routeFolders.map((f) => (
            <button key={f.id} onClick={() => { onAssignRouteFolder(r.id, f.id); setFolderMenuRouteId(null) }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
              <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
              {r.folder_id === f.id && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )

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
    setExpandedGroups((prev) => {
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
    const hidden        = hiddenCommunityIds.has(c.id)
    const currentGroupId= communityGroupMap.get(c.id) ?? null
    const pickerOpen    = groupPicker === c.id

    return (
      <div key={c.id} className={`group mb-0.5 ${inGroup ? 'pl-4' : ''}`}>
        {/* ── Main row: button (flex-1) + action clusters in normal flow so a long
              name truncates to make room instead of running under the icons ── */}
        <div className={`relative flex items-center rounded-lg transition-colors ${
          active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        } ${hidden ? 'opacity-45' : ''}`}>
          <button
            onClick={() => { setGroupPicker(null); onSelectCommunity(active ? null : c.id) }}
            className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left md:py-2"
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

            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>

            {c.is_private && <Lock className="h-3 w-3 shrink-0 text-gray-600" />}
            {(owner || mod) && (
              <Shield
                className="h-3 w-3 shrink-0"
                style={{ color: owner ? c.color : '#9ca3af' }}
                aria-label={owner ? 'You own this community' : 'You are a moderator'}
              />
            )}
          </button>

          {/* ── Right cluster: mobile (always visible, in flow) ── */}
          <div className="flex shrink-0 items-center gap-0.5 pr-1 md:hidden">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCommunityVisibility(c.id) }}
              title={hidden ? 'Show pins on map' : 'Hide pins from map'}
              className={`rounded-lg p-2 transition-colors ${hidden ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-400'}`}
            >
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
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

          {/* ── Right cluster: desktop (pin count → actions on hover, in flow) ── */}
          <div className="hidden shrink-0 items-center pr-2 md:flex">
            <span className={`rounded-full px-2 py-0.5 text-xs md:group-hover:hidden ${
              active ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-500'
            }`}>
              {countFor(c.id)}
            </span>
            <div className="hidden items-center gap-0.5 md:group-hover:flex">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleCommunityVisibility(c.id) }}
                title={hidden ? 'Show pins on map' : 'Hide pins from map'}
                className={`rounded p-1 transition-colors ${hidden ? 'text-indigo-400 hover:text-indigo-300' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
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
          </div>
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

  // Auto-folder row: a leading chevron (expand) + a body button (filter the map).
  // `icon` is the full colored icon span; children render when open.
  const renderAutoFolder = (
    open: boolean, onToggle: () => void,
    active: boolean, onClick: () => void,
    icon: React.ReactNode, label: string, count: number,
    activeRow: string, activeBadge: string,
    children: React.ReactNode,
  ) => (
    <div className="mb-1">
      <div className={`flex items-center rounded-lg transition-colors ${active ? activeRow : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          title={open ? 'Collapse' : 'Expand'}
          className="flex h-9 shrink-0 items-center pl-2 pr-0.5 text-gray-500 transition-colors hover:text-gray-300"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-3 text-left">
          {icon}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${active ? activeBadge : 'bg-gray-800 text-gray-500'}`}>{count}</span>
        </button>
      </div>
      {open && <div className="mb-1 pl-2">{children}</div>}
    </div>
  )

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
              onClick={() => onTabChange('feed')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === 'feed' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Newspaper className="h-3.5 w-3.5" />
              Feed
            </button>
          </div>
        </div>

        {/* ── Activity feed ── */}
        {tab === 'feed' && (
          <div className="flex-1 overflow-y-auto p-3">
            <ActivityFeed
              pins={pins}
              followedUserIds={followedUserIds}
              subscribedIds={subscribedIds}
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

          {/* All Communities — auto-folder: click filters to everything, chevron lists all */}
          {renderAutoFolder(
            allOpen, () => setAllOpen((v) => !v),
            !selectedCommunity && !showSubscribedOnly && !showSavedOnly && !activeFolderId,
            () => { setGroupPicker(null); onSelectCommunity(null) },
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm">🌍</span>,
            'All Communities', pins.length,
            'bg-indigo-600 text-white', 'bg-indigo-700 text-indigo-200',
            [...communities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => renderRow(c, true)),
          )}

          {/* My Subscriptions — auto-folder */}
          {user && subscribedIds.size > 0 && renderAutoFolder(
            subsOpen, () => setSubsOpen((v) => !v),
            showSubscribedOnly,
            () => { setGroupPicker(null); onShowSubscribed() },
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-500/10 text-sm">⭐</span>,
            'My Subscriptions', pins.filter((p) => subscribedIds.has(p.community_id)).length,
            'bg-yellow-500/20 text-yellow-300', 'bg-yellow-500/20 text-yellow-400',
            communities.filter((c) => subscribedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => renderRow(c, true)),
          )}

          {/* Saved — a pin filter, not a folder */}
          {user && savedCount > 0 && (
            <button
              onClick={() => { setGroupPicker(null); onShowSaved() }}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                showSavedOnly
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-300">
                <BookmarkCheck className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium">Saved</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                showSavedOnly ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-800 text-gray-500'
              }`}>
                {savedCount}
              </span>
            </button>
          )}

          {/* ── Group folders ── */}
          {user && groups.map((group) => {
            const collapsed  = !expandedGroups.has(group.id)
            const comms      = groupedMap.get(group.id) ?? []
            const isRenaming = renamingGroupId === group.id

            return (
              <div key={group.id} className="mb-1">
                {/* Group header — chevron expands, name filters the map */}
                <div
                  className={`group/grp mb-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                    activeFolderId === group.id ? 'bg-indigo-600/20' : 'hover:bg-gray-800/50'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => toggleCollapse(group.id)}
                    title={collapsed ? 'Expand' : 'Collapse'}
                    className="shrink-0 text-gray-600 transition-colors hover:text-gray-300"
                  >
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
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
                      className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-wider text-gray-400 outline-none"
                    />
                  ) : (
                    <button onClick={() => onSelectFolder(group.id)} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-xs font-semibold uppercase tracking-wider ${
                        activeFolderId === group.id ? 'text-indigo-300' : 'text-gray-500'
                      }`}>
                        {group.name}
                      </span>
                    </button>
                  )}

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
          {/* Flat when short; tucked into a collapsed "Other" folder once crowded. */}
          {unsubscribedVisible.length > OTHER_FOLDER_THRESHOLD ? (
            renderAutoFolder(
              otherOpen, () => setOtherOpen((v) => !v),
              false, () => setOtherOpen((v) => !v),
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800"><Folder className="h-3.5 w-3.5 text-gray-400" /></span>,
              'Other communities', unsubscribedVisible.length,
              '', '',
              unsubscribedVisible.map((c) => renderRow(c, true)),
            )
          ) : (
            unsubscribedVisible.map((c) => renderRow(c, false))
          )}

          <div className="my-2 border-t border-gray-800" />

          {/* ── Routes ── */}
          {user && (
            <div className="mb-1" onClick={(e) => e.stopPropagation()}>
              {/* Section header — compact icon buttons, matching Communities */}
              <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Routes</p>
                <div className="flex items-center gap-1">
                  {routes.length > 0 && (
                    <button
                      onClick={() => { setCreatingFolder((v) => !v); setNewFolderName('') }}
                      title="New route folder"
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => { setCreatingRoute((v) => !v); setNewRouteName('') }}
                    title="New route"
                    className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline create inputs */}
              {creatingRoute && (
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  onBlur={submitNewRoute}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewRoute()
                    if (e.key === 'Escape') { setCreatingRoute(false); setNewRouteName('') }
                  }}
                  placeholder="Route name…"
                  className="mb-1 w-full rounded-lg border border-indigo-500 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none"
                />
              )}
              {creatingFolder && (
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={submitNewFolder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewFolder()
                    if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                  }}
                  placeholder="Folder name…"
                  className="mb-1 w-full rounded-lg border border-indigo-500 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none"
                />
              )}

              {/* All Routes — auto-folder (expands to every route; no map filter) */}
              {routes.length > 0 && renderAutoFolder(
                allRoutesOpen, () => setAllRoutesOpen((v) => !v),
                false, () => setAllRoutesOpen((v) => !v),
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800"><RouteIcon className="h-3.5 w-3.5 text-gray-400" /></span>,
                'All Routes', routes.length,
                '', '',
                [...routes].sort((a, b) => a.name.localeCompare(b.name)).map(renderRouteRow),
              )}

              {/* Folders (collapsed by default) */}
              {routeFolders.map((folder) => {
                const collapsed = !expandedFolders.has(folder.id)
                const inFolder = routes.filter((r) => r.folder_id === folder.id)
                const isRenaming = renamingFolderId === folder.id
                return (
                  <div key={folder.id} className="mb-1">
                    <div className="group/fld mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-gray-800/50">
                      <button onClick={() => toggleFolder(folder.id)} className="flex min-w-0 flex-1 items-center gap-1.5">
                        {collapsed ? <ChevronRight className="h-3 w-3 shrink-0 text-gray-600" /> : <ChevronDown className="h-3 w-3 shrink-0 text-gray-600" />}
                        {isRenaming ? (
                          <input
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            value={folderRename}
                            onChange={(e) => setFolderRename(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { if (folderRename.trim()) onRenameRouteFolder(folder.id, folderRename.trim()); setRenamingFolderId(null) }
                              if (e.key === 'Escape') setRenamingFolderId(null)
                            }}
                            onBlur={() => { if (folderRename.trim() && folderRename.trim() !== folder.name) onRenameRouteFolder(folder.id, folderRename.trim()); setRenamingFolderId(null) }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent text-xs font-semibold uppercase tracking-wider text-gray-400 outline-none"
                          />
                        ) : (
                          <span className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500">{folder.name}</span>
                        )}
                      </button>
                      <span className="shrink-0 text-[10px] text-gray-700">{inFolder.length}</span>
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/fld:opacity-100">
                        {!isRenaming && (
                          <button onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setFolderRename(folder.name) }} title="Rename folder"
                            className="rounded p-0.5 text-gray-600 transition-colors hover:text-gray-300">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onDeleteRouteFolder(folder.id) }} title="Delete folder (keeps the routes)"
                          className="rounded p-0.5 text-gray-600 transition-colors hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {!collapsed && inFolder.map(renderRouteRow)}
                    {!collapsed && inFolder.length === 0 && (
                      <p className="py-1 pl-8 text-[10px] italic text-gray-700">Empty — move routes here</p>
                    )}
                  </div>
                )
              })}

              {/* Ungrouped routes */}
              {routeFolders.length > 0 && routes.some((r) => !r.folder_id) && (
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-700">Other routes</p>
              )}
              {routes.filter((r) => !r.folder_id).map(renderRouteRow)}

              {/* Empty state */}
              {routes.length === 0 && routeFolders.length === 0 && !creatingRoute && (
                <p className="px-2 py-1 text-xs text-gray-600">No routes yet — tap + to start one.</p>
              )}
            </div>
          )}
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
              Sign in
            </button>
          )}
        </div>
      </aside>
    </>
  )
}

'use client'

import { Bookmark, BookmarkCheck, LogOut, MapPin, Plus, Search, Settings, Shield, User2, ArrowUpRight, X } from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Community, Pin } from '@/lib/types'
import { avatarColor } from '@/lib/utils'
import Avatar from '@/components/Avatar'

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
  onSelectCommunity: (id: string | null) => void
  onShowSubscribed: () => void
  onToggleSubscription: (id: string) => void
  onOpenSettings: (id: string) => void
  user: User | null
  authReady: boolean
  onSignIn: () => void
  onSignOut: () => void
  onCreateCommunity: () => void
  onOpenSearch: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({
  communities,
  pins,
  selectedCommunity,
  showSubscribedOnly,
  subscribedIds,
  ownedCommunityIds,
  modCommunityIds,
  onSelectCommunity,
  onShowSubscribed,
  onToggleSubscription,
  onOpenSettings,
  user,
  authReady,
  onSignIn,
  onSignOut,
  onCreateCommunity,
  onOpenSearch,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const countFor = (id: string) => pins.filter((p) => p.community_id === id).length

  const isOwner = (id: string) => ownedCommunityIds.has(id)
  const isMod = (id: string) => modCommunityIds.has(id)
  const isSubscribed = (id: string) => subscribedIds.has(id)

  return (
    <>
      {/* Mobile backdrop — tap to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          flex flex-col border-r border-gray-800 bg-gray-900
          fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300
          md:relative md:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
            <MapPin className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-none text-white">MapCrowd</h1>
            <p className="mt-0.5 text-xs text-gray-500">crowd-sourced maps</p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onMobileClose}
            className="md:hidden rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Search button */}
        <button
          onClick={onOpenSearch}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-600">⌘K</kbd>
        </button>
      </div>

      {/* Community list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            Communities
          </p>
          {user && (
            <button
              onClick={onCreateCommunity}
              title="Create a new community"
              className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-700 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* All */}
        <button
          onClick={() => onSelectCommunity(null)}
          className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
            !selectedCommunity && !showSubscribedOnly
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-sm">
            🌍
          </span>
          <span className="flex-1 text-sm font-medium">All Communities</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              !selectedCommunity && !showSubscribedOnly
                ? 'bg-indigo-700 text-indigo-200'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            {pins.length}
          </span>
        </button>

        {/* Subscribed filter — only shown when logged in */}
        {user && subscribedIds.size > 0 && (
          <button
            onClick={onShowSubscribed}
            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
              showSubscribedOnly
                ? 'bg-yellow-500/20 text-yellow-300'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500/10 text-sm">
              ⭐
            </span>
            <span className="flex-1 text-sm font-medium">My Subscriptions</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                showSubscribedOnly ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-800 text-gray-500'
              }`}
            >
              {pins.filter((p) => subscribedIds.has(p.community_id)).length}
            </span>
          </button>
        )}

        {/* Divider */}
        <div className="my-2 border-t border-gray-800" />

        {/* Per community */}
        {communities.map((c) => {
          const active = selectedCommunity === c.id
          const subscribed = isSubscribed(c.id)
          const owner = isOwner(c.id)
          const mod = isMod(c.id)

          return (
            <div key={c.id} className="group relative mb-1">
              {/* Main row button */}
              <button
                onClick={() => onSelectCommunity(active ? null : c.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  active
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{
                    backgroundColor: c.color + '22',
                    border: `2px solid ${c.color}`,
                  }}
                >
                  {c.icon}
                  {/* Subscribed indicator dot */}
                  {subscribed && (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-gray-900 bg-yellow-400"
                      title="Subscribed"
                    />
                  )}
                </span>

                <span className="flex-1 truncate text-sm font-medium">{c.name}</span>

                {/* Mod/owner badges */}
                {(owner || mod) && (
                  <Shield
                    className="h-3 w-3 shrink-0"
                    style={{ color: owner ? c.color : '#9ca3af' }}
                    aria-label={owner ? 'You own this community' : 'You are a moderator'}
                  />
                )}

                {/* Pin count — hidden on hover to make room for actions */}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs group-hover:opacity-0 ${
                    active ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {countFor(c.id)}
                </span>
              </button>

              {/* Hover action buttons — absolutely positioned over the count badge */}
              <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                {/* Subscribe / unsubscribe */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleSubscription(c.id)
                  }}
                  title={subscribed ? 'Unsubscribe' : 'Subscribe'}
                  className={`rounded p-1 transition-colors ${
                    subscribed
                      ? 'text-yellow-400 hover:text-yellow-300'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {subscribed ? (
                    <BookmarkCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Community page link */}
                <Link
                  href={`/c/${c.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  title="View community page"
                  className="rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>

                {/* Settings — owners see full settings; mods see queue only */}
                {(owner || mod) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenSettings(c.id)
                    }}
                    title={owner ? 'Community settings' : 'Moderation queue'}
                    className="rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 p-4 space-y-3">
        {/* Live dot */}
        <div className="flex items-center gap-2">
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

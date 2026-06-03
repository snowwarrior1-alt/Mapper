'use client'

import { useMemo, useState, useEffect } from 'react'
import { X, ThumbsUp, ThumbsDown, Clock, ArrowUpRight, Lock, Plus, MapPin, Search } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Community, CommunityTag, Pin } from '@/lib/types'
import { timeAgo } from '@/lib/utils'

interface CommunityPinsPanelProps {
  community: Community
  pins: Pin[]
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
  onClose: () => void
  onPinClick: (pin: Pin) => void
  onAddPin: (communityId: string) => void
}

export default function CommunityPinsPanel({
  community,
  pins,
  selectedTagIds,
  onToggleTag,
  onClose,
  onPinClick,
  onAddPin,
}: CommunityPinsPanelProps) {
  // Community tag vocabulary — drives the filter chips
  const [tags, setTags] = useState<CommunityTag[]>([])
  useEffect(() => {
    setTags([])
    supabase
      .from('community_tags')
      .select('*')
      .eq('community_id', community.id)
      .order('name')
      .then(({ data }) => { if (data) setTags(data as CommunityTag[]) })
  }, [community.id])
  // Sort by vote count desc, then newest first for ties
  const sorted = useMemo(
    () =>
      [...pins].sort(
        (a, b) =>
          b.vote_count - a.vote_count ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [pins]
  )

  // ── Text search within the community's pins ────────────────────────────────
  const [query, setQuery] = useState('')
  // Reset the search box when switching communities
  useEffect(() => { setQuery('') }, [community.id])
  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
    )
  }, [sorted, query])
  // Show the search box once a community has a non-trivial number of pins
  const showSearch = sorted.length > 5

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1150] flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-gray-800 bg-gray-900/95 shadow-2xl backdrop-blur-sm sm:bottom-auto sm:left-auto sm:top-0 sm:h-full sm:max-h-none sm:w-80 sm:rounded-none sm:border-b-0 sm:border-l sm:border-r-0 sm:border-t-0">

      {/* Drag handle — mobile only */}
      <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
        <div className="h-1 w-10 rounded-full bg-gray-700" />
      </div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-3"
        style={{ backgroundColor: community.color + '18' }}
      >
        {/* Icon + name */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: community.color + '22', border: `2px solid ${community.color}` }}
          >
            {community.icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-bold text-white">{community.name}</h2>
              {community.is_private && <Lock className="h-3 w-3 shrink-0 text-gray-500" />}
            </div>
            <p className="text-xs text-gray-500">
              {sorted.length} {sorted.length === 1 ? 'pin' : 'pins'}
            </p>
            {community.geo_restriction && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{community.geo_restriction.name} only</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/c/${community.slug}`}
            onClick={(e) => e.stopPropagation()}
            title="View community page"
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <button
            onClick={() => onAddPin(community.id)}
            title="Drop a pin in this community"
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-indigo-400"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Tag filter chips ─────────────────────────────────────────── */}
      {tags.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-gray-800 px-4 py-2.5">
          {tags.map((tag) => {
            const active = selectedTagIds.has(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => onToggleTag(tag.id)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all"
                style={
                  active
                    ? { borderColor: community.color, backgroundColor: community.color + '22', color: community.color }
                    : { borderColor: '#374151', color: '#9ca3af' }
                }
              >
                {tag.name}
              </button>
            )
          })}
          {selectedTagIds.size > 0 && (
            <button
              onClick={() => tags.forEach((t) => { if (selectedTagIds.has(t.id)) onToggleTag(t.id) })}
              className="rounded-full px-2 py-0.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Search box ───────────────────────────────────────────────── */}
      {showSearch && (
        <div className="shrink-0 border-b border-gray-800 px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${sorted.length} pins…`}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-8 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 transition-colors hover:text-gray-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Pin list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-5xl opacity-30">{community.icon}</span>
            <p className="text-sm font-medium text-gray-400">No pins yet</p>
            <p className="text-xs leading-relaxed text-gray-600">
              Be the first to drop a pin in {community.name}!
            </p>
            <button
              onClick={() => onAddPin(community.id)}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Drop a pin
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Search className="h-7 w-7 text-gray-700" />
            <p className="text-sm font-medium text-gray-400">No pins match “{query}”</p>
            <button
              onClick={() => setQuery('')}
              className="text-xs text-indigo-400 transition-colors hover:text-indigo-300"
            >
              Clear search
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {displayed.map((pin) => {
              const isPositive = pin.vote_count > 0
              const isNegative = pin.vote_count < 0
              const voteColor = isPositive
                ? 'text-green-400'
                : isNegative
                ? 'text-red-400'
                : 'text-gray-600'

              return (
                <li key={pin.id}>
                  <button
                    onClick={() => onPinClick(pin)}
                    className="group w-full px-4 py-3.5 text-left transition-colors hover:bg-gray-800/50"
                  >
                    <div className="flex items-start gap-3">

                      {/* Vote score column */}
                      <div className={`flex w-8 shrink-0 flex-col items-center gap-0.5 pt-0.5 ${voteColor}`}>
                        {isNegative
                          ? <ThumbsDown className="h-3.5 w-3.5" />
                          : <ThumbsUp className="h-3.5 w-3.5" />}
                        <span className="text-xs font-bold tabular-nums leading-none">
                          {isPositive ? `+${pin.vote_count}` : pin.vote_count}
                        </span>
                      </div>

                      {/* Content column */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-white transition-colors group-hover:text-indigo-300">
                          {pin.title}
                        </p>
                        {pin.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                            {pin.description}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-600">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span>{timeAgo(pin.created_at)}</span>
                          {pin.profile?.username && (
                            <>
                              <span>·</span>
                              <span>{pin.profile.username}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

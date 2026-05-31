'use client'

import { useMemo } from 'react'
import { Newspaper, MapPin, ThumbsUp, Calendar, Star, BookmarkCheck, UserPlus } from 'lucide-react'
import { Pin } from '@/lib/types'
import { timeAgo } from '@/lib/utils'
import Avatar from '@/components/Avatar'

interface ActivityFeedProps {
  pins: Pin[]
  /** User IDs the current user follows */
  followedUserIds: Set<string>
  /** Community IDs the current user subscribes to */
  subscribedIds: Set<string>
  /** Fly to + open the pin */
  onSelectPin: (pin: Pin) => void
  signedIn: boolean
  onSignIn: () => void
}

const FEED_LIMIT = 60

export default function ActivityFeed({
  pins,
  followedUserIds,
  subscribedIds,
  onSelectPin,
  signedIn,
  onSignIn,
}: ActivityFeedProps) {
  // Union of (pins by followed users) ∪ (pins in subscribed communities),
  // most-recent-first. Each item is tagged with WHY it's here.
  const feed = useMemo(() => {
    return pins
      .map((p) => {
        const byFollowed = !!p.user_id && followedUserIds.has(p.user_id)
        const bySubscribed = subscribedIds.has(p.community_id)
        return { pin: p, byFollowed, bySubscribed }
      })
      .filter((x) => x.byFollowed || x.bySubscribed)
      .sort((a, b) => b.pin.created_at.localeCompare(a.pin.created_at))
      .slice(0, FEED_LIMIT)
  }, [pins, followedUserIds, subscribedIds])

  const hasSources = followedUserIds.size > 0 || subscribedIds.size > 0

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!signedIn) {
    return (
      <div className="px-3 py-10 text-center">
        <Newspaper className="mx-auto mb-3 h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">Your activity feed</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-600">
          Sign in, then follow people and subscribe to communities to see their
          latest pins here.
        </p>
        <button
          onClick={onSignIn}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Sign in
        </button>
      </div>
    )
  }

  if (!hasSources) {
    return (
      <div className="px-3 py-10 text-center">
        <UserPlus className="mx-auto mb-3 h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">Nothing in your feed yet</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-600">
          Subscribe to communities or follow other mappers and their newest pins
          will gather here.
        </p>
      </div>
    )
  }

  if (feed.length === 0) {
    return (
      <div className="px-3 py-10 text-center">
        <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">No recent activity</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-600">
          Your communities and the people you follow haven&apos;t dropped any pins
          lately. Check back soon!
        </p>
      </div>
    )
  }

  // ── Feed ──────────────────────────────────────────────────────────────────
  return (
    <ul className="space-y-1.5">
      {feed.map(({ pin, byFollowed, bySubscribed }) => {
        const comm = pin.community
        const voteColor =
          pin.vote_count > 0 ? 'text-green-400' : pin.vote_count < 0 ? 'text-red-400' : 'text-gray-600'
        return (
          <li key={pin.id}>
            <button
              onClick={() => onSelectPin(pin)}
              className="flex w-full items-start gap-2.5 rounded-lg border border-gray-800 bg-gray-800/30 p-2.5 text-left transition-colors hover:border-gray-700 hover:bg-gray-800/60"
            >
              <Avatar
                src={pin.profile?.avatar_url}
                username={pin.profile?.username ?? '?'}
                userId={pin.user_id ?? '0'}
                className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-[10px]"
                chars={1}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="truncate font-medium text-gray-300">
                    {pin.profile?.username ?? 'Someone'}
                  </span>
                  <span>·</span>
                  <span className="shrink-0">{timeAgo(pin.created_at)}</span>
                  {/* Why this is in your feed */}
                  {byFollowed ? (
                    <span className="ml-auto flex shrink-0 items-center gap-0.5 text-amber-400" title="From someone you follow">
                      <Star className="h-3 w-3 fill-current" />
                    </span>
                  ) : bySubscribed ? (
                    <span className="ml-auto flex shrink-0 items-center gap-0.5 text-indigo-400" title="From a community you subscribe to">
                      <BookmarkCheck className="h-3 w-3" />
                    </span>
                  ) : null}
                </div>

                <p className="mt-0.5 flex items-center gap-1 truncate text-sm font-medium text-white">
                  {pin.event_date && <Calendar className="h-3 w-3 shrink-0 text-indigo-400" />}
                  {pin.title}
                </p>

                <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                  {comm && (
                    <span
                      className="inline-flex max-w-[8rem] items-center gap-1 truncate rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: comm.color + '22', color: comm.color }}
                    >
                      <span>{comm.icon}</span>
                      <span className="truncate">{comm.name}</span>
                    </span>
                  )}
                  <span className={`flex items-center gap-0.5 ${voteColor}`}>
                    <ThumbsUp className="h-3 w-3" />
                    {pin.vote_count > 0 ? `+${pin.vote_count}` : pin.vote_count}
                  </span>
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

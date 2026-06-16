'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import {
  ArrowLeft, MapPin, Users, Bookmark, BookmarkCheck,
  Shield, Clock, Lock, Loader2, ThumbsUp, MessageSquare,
  AlertCircle, Route as RouteIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Community, Pin, Route, PIN_DURATION_LABELS, WHO_CAN_PIN_LABELS } from '@/lib/types'
import { timeAgo, formatCount, voteColorClass, formatVoteCount } from '@/lib/utils'

// ── Pin card ──────────────────────────────────────────────────────────────────

function PinCard({ pin }: { pin: Pin & { comment_count?: number } }) {
  const voteColor = voteColorClass(pin.vote_count)

  return (
    <li className="rounded-xl border border-gray-800 bg-gray-800/30 p-4 transition-colors hover:border-gray-700 hover:bg-gray-800/60">
      <div className="flex items-start gap-3">
        {/* Vote score */}
        <div className={`shrink-0 text-center ${voteColor}`}>
          <ThumbsUp className="mx-auto h-4 w-4 mb-0.5" />
          <span className="block text-sm font-bold tabular-nums">
            {formatVoteCount(pin.vote_count)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white leading-snug">{pin.title}</h3>
          {pin.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{pin.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            {pin.profile?.username && (
              <span>
                by{' '}
                <Link
                  href={`/u/${pin.profile.username}`}
                  className="text-gray-400 hover:text-indigo-400 transition-colors"
                >
                  {pin.profile.username}
                </Link>
              </span>
            )}
            <span>{timeAgo(pin.created_at)}</span>
            <span className="font-mono">{pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}</span>
            {pin.comment_count !== undefined && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {pin.comment_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const [user, setUser] = useState<User | null>(null)
  const [community, setCommunity] = useState<Community | null>(null)
  const [pins, setPins] = useState<(Pin & { comment_count?: number })[]>([])
  const [routes, setRoutes] = useState<(Route & { route_pins?: { count: number }[] })[]>([])
  const [pinCount, setPinCount] = useState(0)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [togglingSubscription, setTogglingSubscription] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Fetch community + pins + stats ─────────────────────────────────────
  const load = useCallback(async () => {
    if (!slug) return
    setLoading(true)

    // 1. Community by slug
    const { data: comm } = await supabase
      .from('communities')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!comm) { setNotFound(true); setLoading(false); return }
    setCommunity(comm)

    // 2. Stats via RPC (bypasses RLS for subscriber count)
    const { data: stats } = await supabase.rpc('get_community_stats', {
      p_community_id: comm.id,
    })
    if (stats?.[0]) {
      setPinCount(Number(stats[0].pin_count))
      setSubscriberCount(Number(stats[0].subscriber_count))
    }

    // 3. Recent approved pins with profile join
    const now = new Date().toISOString()
    const { data: pinData } = await supabase
      .from('pins')
      .select('*, profile:profiles(username, avatar_url)')
      .eq('community_id', comm.id)
      .eq('status', 'approved')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (pinData) setPins(pinData)

    // 4. Public routes published to this community (RLS allows anon read)
    const { data: routeData } = await supabase
      .from('routes')
      .select('*, profile:profiles(username, avatar_url), route_pins(count)')
      .eq('community_id', comm.id)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    if (routeData) setRoutes(routeData as (Route & { route_pins?: { count: number }[] })[])

    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  // ── Check subscription once user is known ─────────────────────────────
  useEffect(() => {
    if (!user || !community) { setIsSubscribed(false); return }
    supabase
      .from('community_subscriptions')
      .select('community_id')
      .eq('community_id', community.id)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsSubscribed(!!data))
  }, [user, community])

  // ── Subscribe / unsubscribe ────────────────────────────────────────────
  const handleToggleSubscription = async () => {
    if (!user) { router.push('/') ; return } // redirect to map which will open auth
    if (!community) return
    setTogglingSubscription(true)

    if (isSubscribed) {
      await supabase.from('community_subscriptions')
        .delete()
        .eq('community_id', community.id)
        .eq('user_id', user.id)
      setIsSubscribed(false)
      setSubscriberCount((n) => Math.max(0, n - 1))
    } else {
      await supabase.from('community_subscriptions')
        .insert({ community_id: community.id, user_id: user.id })
      setIsSubscribed(true)
      setSubscriberCount((n) => n + 1)
    }

    setTogglingSubscription(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (notFound || !community) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-600" />
        <p className="text-lg font-medium">Community not found</p>
        <Link href="/" className="text-indigo-400 hover:underline">← Back to map</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Color banner header ─────────────────────────────────────────── */}
      <div
        className="relative"
        style={{ background: `linear-gradient(135deg, ${community.color}33, ${community.color}11)` }}
      >
        {/* Back button */}
        <div className="mx-auto max-w-2xl px-4 pt-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to map
          </Link>
        </div>

        <div className="mx-auto max-w-2xl px-4 py-8">
          {/* Community identity */}
          <div className="flex items-center gap-5 mb-6">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl shadow-lg"
              style={{ backgroundColor: community.color + '33', border: `3px solid ${community.color}` }}
            >
              {community.icon}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{community.name}</h1>
              <p className="mt-0.5 text-sm text-gray-400">c/{community.slug}</p>
            </div>
          </div>

          {community.description && (
            <p className="mb-6 text-gray-300 leading-relaxed">{community.description}</p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-6 mb-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{formatCount(pinCount)}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" /> Pins
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{formatCount(subscriberCount)}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Users className="h-3 w-3" /> Subscribers
              </p>
            </div>
          </div>

          {/* Subscribe button */}
          <button
            onClick={handleToggleSubscription}
            disabled={togglingSubscription}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              isSubscribed
                ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            } disabled:opacity-60`}
          >
            {togglingSubscription ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSubscribed ? (
              <BookmarkCheck className="h-4 w-4" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>
      </div>

      {/* ── Community rules ─────────────────────────────────────────────── */}
      <div className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              <span className="font-medium text-gray-300">Who can pin:</span>
              {WHO_CAN_PIN_LABELS[community.who_can_pin]}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium text-gray-300">Pin lifespan:</span>
              {PIN_DURATION_LABELS[community.default_pin_duration]}
            </span>
            {community.require_approval && (
              <span className="flex items-center gap-1.5 text-amber-500">
                <Shield className="h-3.5 w-3.5" />
                Pins require mod approval
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Routes ──────────────────────────────────────────────────────── */}
      {routes.length > 0 && (
        <section className="mx-auto max-w-2xl px-4 pt-8">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
            <RouteIcon className="h-4 w-4" />
            Routes
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">{routes.length}</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {routes.map((r) => {
              const stopCount = r.route_pins?.[0]?.count ?? 0
              return (
                <li key={r.id}>
                  <Link
                    href={`/?route=${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3 transition-colors hover:border-gray-700 hover:bg-gray-900"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: r.color + '22', border: `2px solid ${r.color}` }}
                    >
                      <RouteIcon className="h-4 w-4" style={{ color: r.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{r.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                        {r.profile?.username && <> · by {r.profile.username}</>}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ── Pin feed ────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
          <MapPin className="h-4 w-4" />
          Recent Pins
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">{pinCount}</span>
        </h2>

        {pins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-700" />
            <p className="text-gray-500">No pins yet — be the first to drop one!</p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Go to the map
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {pins.map((pin) => (
              <PinCard key={pin.id} pin={pin} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

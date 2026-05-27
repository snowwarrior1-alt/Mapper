'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, ThumbsUp, Users, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Profile, Pin } from '@/lib/types'
import { timeAgo, avatarColor } from '@/lib/utils'
import Avatar from '@/components/Avatar'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params = useParams()
  const username = params?.username as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)

    // 1. Fetch profile by username
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (!prof) { setNotFound(true); setLoading(false); return }
    setProfile(prof)

    // 2. Fetch their approved, non-expired pins (sorted by vote score)
    const now = new Date().toISOString()
    const { data: pinData } = await supabase
      .from('pins')
      .select('*, community:communities(id,name,color,icon,slug)')
      .eq('user_id', prof.id)
      .eq('status', 'approved')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('vote_count', { ascending: false })
      .limit(50)

    if (pinData) setPins(pinData)
    setLoading(false)
  }, [username])

  useEffect(() => { load() }, [load])

  // ── Derived stats (memoised — only recompute when pins changes) ─────────
  const { totalVotes, communityCount, topCommunities } = useMemo(() => {
    const votes = pins.reduce((sum, p) => sum + p.vote_count, 0)
    const commCount = new Set(pins.map((p) => p.community_id)).size

    const commPinCounts = pins.reduce((acc, p) => {
      acc[p.community_id] = (acc[p.community_id] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const top = Object.entries(commPinCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([id, count]) => ({
        id,
        count,
        comm: pins.find((p) => p.community_id === id)?.community,
      }))
      .filter((t) => t.comm)

    return { totalVotes: votes, communityCount: commCount, topCommunities: top }
  }, [pins])

  // ── Loading / not-found states ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-gray-400">
        <AlertCircle className="h-12 w-12 text-gray-600" />
        <p className="text-lg font-medium">User not found</p>
        <Link href="/" className="text-indigo-400 hover:underline">← Back to map</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Profile header ───────────────────────────────────────────────── */}
      <div className="border-b border-gray-800 bg-gray-900">
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
          {/* Avatar + name */}
          <div className="flex items-center gap-5">
            <Avatar
              src={profile.avatar_url}
              username={profile.username}
              userId={profile.id}
              className="h-20 w-20 rounded-2xl text-3xl ring-4 ring-gray-800"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">{profile.username}</h1>
              <p className="mt-1 text-sm text-gray-500">
                Joined{' '}
                {new Date(profile.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 flex flex-wrap gap-8">
            <div>
              <p className="text-2xl font-bold text-white">{pins.length}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" /> Pins
              </p>
            </div>
            <div>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  totalVotes > 0 ? 'text-green-400' : totalVotes < 0 ? 'text-red-400' : 'text-white'
                }`}
              >
                {totalVotes > 0 ? `+${totalVotes}` : totalVotes}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <ThumbsUp className="h-3 w-3" /> Net votes
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{communityCount}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <Users className="h-3 w-3" /> Communities
              </p>
            </div>
          </div>

          {/* Top community chips */}
          {topCommunities.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {topCommunities.map(({ id, count, comm }) =>
                comm ? (
                  <Link
                    key={id}
                    href={`/c/${comm.slug}`}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-75"
                    style={{
                      backgroundColor: comm.color + '22',
                      border: `1px solid ${comm.color}55`,
                      color: '#fff',
                    }}
                  >
                    {comm.icon} {comm.name}
                    <span className="ml-1 text-gray-500">({count})</span>
                  </Link>
                ) : null
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Pin feed ─────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
          <MapPin className="h-4 w-4" />
          Pins
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">{pins.length}</span>
        </h2>

        {pins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-700" />
            <p className="text-gray-500">No pins yet.</p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Go to the map
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {pins.map((pin) => {
              const voteColor =
                pin.vote_count > 0 ? 'text-green-400' : pin.vote_count < 0 ? 'text-red-400' : 'text-gray-500'
              const comm = pin.community

              return (
                <li
                  key={pin.id}
                  className="rounded-xl border border-gray-800 bg-gray-800/30 p-4 transition-colors hover:border-gray-700 hover:bg-gray-800/60"
                >
                  <div className="flex items-start gap-3">
                    {/* Vote score */}
                    <div className={`shrink-0 text-center ${voteColor}`}>
                      <ThumbsUp className="mx-auto h-4 w-4 mb-0.5" />
                      <span className="block text-sm font-bold tabular-nums">
                        {pin.vote_count > 0 ? `+${pin.vote_count}` : pin.vote_count}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug text-white">{pin.title}</h3>
                      {pin.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{pin.description}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                        {/* Community chip */}
                        {comm && (
                          <Link
                            href={`/c/${comm.slug}`}
                            className="flex items-center gap-1 transition-colors hover:text-gray-400"
                          >
                            <span
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                              style={{ backgroundColor: comm.color + '33', border: `1px solid ${comm.color}` }}
                            >
                              {comm.icon}
                            </span>
                            {comm.name}
                          </Link>
                        )}
                        <span>{timeAgo(pin.created_at)}</span>
                        <span className="font-mono">{pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}

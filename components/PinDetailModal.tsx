'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, ThumbsUp, ThumbsDown, Clock, MapPin, Navigation, ExternalLink, Trash2,
  Timer, MessageSquare, Send, ChevronLeft, ChevronRight,
  ImageOff,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Pin, Comment, PinPhoto } from '@/lib/types'
import { getSessionId } from '@/lib/session'
import { timeAgo, timeUntil } from '@/lib/utils'
import Avatar from '@/components/Avatar'

// ── Props ─────────────────────────────────────────────────────────────────────

interface PinDetailModalProps {
  pin: Pin
  user: User | null
  /** True if user is pin author, community owner, or assigned mod */
  canDelete: boolean
  /** True if user is community owner or assigned mod (not just pin author) */
  isModerator: boolean
  onClose: () => void
  onVoteUpdate: (updated: Partial<Pin> & { id: string }) => void
  onDeletePin: (pinId: string) => void
  onSignIn?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PinDetailModal({
  pin,
  user,
  canDelete,
  isModerator,
  onClose,
  onVoteUpdate,
  onDeletePin,
  onSignIn,
}: PinDetailModalProps) {
  // ── Voting ────────────────────────────────────────────────────────────────
  const [userVote, setUserVote] = useState<number>(0)
  const [voting, setVoting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Stable ref — getSessionId() reads/writes localStorage once at mount time
  const sessionId = useRef(getSessionId()).current

  useEffect(() => {
    supabase
      .from('votes')
      .select('value')
      .eq('pin_id', pin.id)
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => setUserVote(data?.value ?? 0))
  }, [pin.id, sessionId])

  useEffect(() => { setConfirmDelete(false) }, [pin.id])

  const handleVote = async (value: number) => {
    if (!user) { onSignIn?.(); return }
    if (voting) return
    setVoting(true)
    const { data, error } = await supabase.rpc('vote_on_pin', {
      p_pin_id: pin.id,
      p_session_id: sessionId,
      p_value: value,
    })
    setVoting(false)
    if (!error && data) {
      setUserVote(userVote === value ? 0 : value)
      onVoteUpdate({ id: pin.id, vote_count: (data as { vote_count: number }).vote_count })
    }
  }

  // ── Address lookup ────────────────────────────────────────────────────────
  const [address, setAddress] = useState<string | null>(null)
  const [loadingAddress, setLoadingAddress] = useState(true)

  useEffect(() => {
    setAddress(null)
    setLoadingAddress(true)
    const ctrl = new AbortController()
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${pin.lat}&lon=${pin.lng}&format=json`,
      { signal: ctrl.signal, headers: { 'Accept-Language': 'en' } }
    )
      .then((r) => r.json())
      .then((data: { address?: Record<string, string>; display_name?: string }) => {
        if (!data?.address) { setAddress(null); return }
        const a = data.address
        const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway ?? a.path]
          .filter(Boolean).join(' ')
        const neighbourhood = a.suburb ?? a.quarter ?? a.neighbourhood ?? a.city_district
        const city = a.city ?? a.town ?? a.village ?? a.municipality
        const region = a.state ?? a.county
        const parts = [street, neighbourhood, city, region].filter(Boolean)
        setAddress(
          parts.slice(0, 3).join(', ') ||
          data.display_name?.split(', ').slice(0, 3).join(', ') ||
          null
        )
      })
      .catch(() => setAddress(null))
      .finally(() => setLoadingAddress(false))
    return () => ctrl.abort()
  }, [pin.id, pin.lat, pin.lng])

  // ── Photos ────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PinPhoto[]>([])
  const [photoIndex, setPhotoIndex] = useState(0)
  const [photoError, setPhotoError] = useState(false)

  useEffect(() => {
    setPhotos([])
    setPhotoIndex(0)
    setPhotoError(false)
    supabase
      .from('pin_photos')
      .select('*')
      .eq('pin_id', pin.id)
      .order('created_at')
      .then(({ data }) => { if (data) setPhotos(data) })
  }, [pin.id])

  // ── Comments ──────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [commentBody, setCommentBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profile:profiles(username, avatar_url)')
      .eq('pin_id', pin.id)
      .order('created_at', { ascending: true })
    if (data) setComments(data as unknown as Comment[])
    setLoadingComments(false)
  }, [pin.id])

  useEffect(() => {
    setComments([])
    setLoadingComments(true)
    fetchComments()

    const channel = supabase
      .channel(`comments:${pin.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `pin_id=eq.${pin.id}` },
        async (payload) => {
          // Fetch with profile join — the raw payload doesn't include it
          const { data } = await supabase
            .from('comments')
            .select('*, profile:profiles(username, avatar_url)')
            .eq('id', (payload.new as { id: string }).id)
            .single()
          if (data) {
            setComments((prev) => {
              // Avoid duplicates (optimistic insert + realtime)
              if (prev.some((c) => c.id === data.id)) return prev
              return [...prev, data as unknown as Comment]
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments', filter: `pin_id=eq.${pin.id}` },
        (payload) => {
          setComments((prev) =>
            prev.filter((c) => c.id !== (payload.old as { id: string }).id)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [pin.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handlePostComment = async () => {
    if (!commentBody.trim() || !user || posting) return
    setPosting(true)
    // Optimistic insert (realtime will deduplicate)
    const tempId = `temp-${Date.now()}`
    const optimistic: Comment = {
      id: tempId,
      pin_id: pin.id,
      user_id: user.id,
      body: commentBody.trim(),
      created_at: new Date().toISOString(),
      profile: { username: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'You', avatar_url: user.user_metadata?.avatar_url ?? null },
    }
    setComments((prev) => [...prev, optimistic])
    setCommentBody('')
    const { error, data } = await supabase
      .from('comments')
      .insert({ pin_id: pin.id, user_id: user.id, body: optimistic.body })
      .select('id')
      .single()
    if (error) {
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      setCommentBody(optimistic.body)
    } else if (data) {
      // Replace temp id with real id
      setComments((prev) =>
        prev.map((c) => (c.id === tempId ? { ...c, id: data.id } : c))
      )
    }
    setPosting(false)
  }

  const handleDeleteComment = async (commentId: string) => {
    setDeletingId(commentId)
    await supabase.from('comments').delete().eq('id', commentId)
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    setDeletingId(null)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const community = pin.community
  const voteColor =
    pin.vote_count > 0 ? 'text-green-400' : pin.vote_count < 0 ? 'text-red-400' : 'text-gray-500'
  const currentPhoto = photos[photoIndex]

  return (
    /* Full-screen backdrop */
    <div
      className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* ── Community banner (sticky) ────────────────────────────────── */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-3"
          style={{ backgroundColor: (community?.color ?? '#6366f1') + '22' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{community?.icon}</span>
            <span className="text-sm font-semibold" style={{ color: community?.color ?? '#818cf8' }}>
              {community?.name ?? 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {canDelete && (
              <button
                onClick={() => {
                  if (!confirmDelete) { setConfirmDelete(true); return }
                  onDeletePin(pin.id)
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                  confirmDelete
                    ? 'bg-red-600 text-white'
                    : 'text-gray-500 hover:bg-red-600/10 hover:text-red-400'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDelete ? 'Confirm?' : 'Remove'}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Photo gallery ─────────────────────────────────────────────── */}
        {photos.length > 0 && (
          <div className="relative shrink-0 bg-black" style={{ height: 220 }}>
            {!photoError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={currentPhoto?.url}
                src={currentPhoto?.url}
                alt={currentPhoto?.caption ?? pin.title}
                className="h-full w-full object-cover"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center gap-2 text-gray-600">
                <ImageOff className="h-6 w-6" />
                <span className="text-sm">Photo unavailable</span>
              </div>
            )}

            {photos.length > 1 && (
              <>
                <button
                  onClick={() => { setPhotoIndex((i) => Math.max(0, i - 1)); setPhotoError(false) }}
                  disabled={photoIndex === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setPhotoIndex((i) => Math.min(photos.length - 1, i + 1)); setPhotoError(false) }}
                  disabled={photoIndex === photos.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setPhotoIndex(i); setPhotoError(false) }}
                      className={`h-1.5 rounded-full transition-all ${
                        i === photoIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5">
            {/* Pin title + metadata */}
            <h3 className="text-lg font-semibold text-white">{pin.title}</h3>
            <div className="mt-1 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo(pin.created_at)}
              </span>
              {pin.profile?.username && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    by{' '}
                    <Link
                      href={`/u/${pin.profile.username}`}
                      className="font-medium text-gray-400 hover:text-indigo-400 transition-colors"
                    >
                      {pin.profile.username}
                    </Link>
                  </span>
                </>
              )}
              {/* Address / coordinates row */}
              <span className="w-full flex items-center gap-1 min-w-0">
                {loadingAddress ? (
                  <span className="h-3 rounded bg-gray-800 animate-pulse" style={{ width: '55%' }} />
                ) : address ? (
                  <>
                    <Navigation className="h-3 w-3 shrink-0 text-gray-600" />
                    <span className="flex-1 truncate text-gray-500">{address}</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 ml-1 flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Maps</span>
                    </a>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-mono text-gray-700">
                      {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                    </span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 ml-1 flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Maps</span>
                    </a>
                  </>
                )}
              </span>
              {pin.expires_at && (
                <span className="flex items-center gap-1 text-amber-500">
                  <Timer className="h-3 w-3" />
                  Expires in {timeUntil(pin.expires_at)}
                </span>
              )}
            </div>

            {pin.description && (
              <p className="mb-4 text-sm leading-relaxed text-gray-400">{pin.description}</p>
            )}

            {/* Voting row */}
            <div className="flex items-center gap-3 border-t border-gray-800 pt-4">
              <span className="text-sm text-gray-400">Helpful?</span>
              <div className="ml-auto flex items-center gap-2">
                {user ? (
                  <>
                    <button
                      onClick={() => handleVote(1)}
                      disabled={voting}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                        userVote === 1
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-green-400'
                      } disabled:opacity-60`}
                    >
                      <ThumbsUp className="h-4 w-4" />
                      {userVote === 1 ? 'Liked' : 'Upvote'}
                    </button>
                    <span className={`min-w-[2rem] text-center text-lg font-bold tabular-nums ${voteColor}`}>
                      {pin.vote_count > 0 ? `+${pin.vote_count}` : pin.vote_count}
                    </span>
                    <button
                      onClick={() => handleVote(-1)}
                      disabled={voting}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                        userVote === -1
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-red-400'
                      } disabled:opacity-60`}
                    >
                      <ThumbsDown className="h-4 w-4" />
                      {userVote === -1 ? 'Downvoted' : 'Downvote'}
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`min-w-[2rem] text-center text-lg font-bold tabular-nums ${voteColor}`}>
                      {pin.vote_count > 0 ? `+${pin.vote_count}` : pin.vote_count}
                    </span>
                    <button
                      onClick={() => onSignIn?.()}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:bg-indigo-600/20 hover:text-indigo-300"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Sign in to vote
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Comments ──────────────────────────────────────────────── */}
            <div className="mt-5 border-t border-gray-800 pt-5">
              <h4 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <MessageSquare className="h-3.5 w-3.5" />
                {loadingComments ? 'Comments' : `${comments.length} Comment${comments.length !== 1 ? 's' : ''}`}
              </h4>

              {loadingComments ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-gray-800" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 rounded bg-gray-800" />
                        <div className="h-3 w-full rounded bg-gray-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-600">
                  No comments yet — be the first!
                </p>
              ) : (
                <ul className="space-y-4">
                  {comments.map((comment) => {
                    const canDeleteComment =
                      user?.id === comment.user_id || isModerator
                    const isTemp = comment.id.startsWith('temp-')
                    return (
                      <li key={comment.id} className={`flex gap-3 ${isTemp ? 'opacity-60' : ''}`}>
                        <Avatar
                          src={comment.profile?.avatar_url}
                          username={comment.profile?.username ?? '?'}
                          userId={comment.user_id}
                          className="h-7 w-7 rounded-full text-[10px]"
                          chars={1}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            {comment.profile?.username ? (
                              <Link
                                href={`/u/${comment.profile.username}`}
                                className="text-xs font-semibold text-gray-300 hover:text-indigo-400 transition-colors"
                              >
                                {comment.profile.username}
                              </Link>
                            ) : (
                              <span className="text-xs font-semibold text-gray-300">Unknown</span>
                            )}
                            <span className="text-[10px] text-gray-600">
                              {timeAgo(comment.created_at)}
                            </span>
                            {canDeleteComment && !isTemp && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                disabled={deletingId === comment.id}
                                className="ml-auto shrink-0 rounded p-0.5 text-gray-700 transition-colors hover:text-red-400 disabled:opacity-40"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm leading-relaxed text-gray-400 break-words">
                            {comment.body}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                  <div ref={commentsEndRef} />
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── Comment input (sticky footer) ─────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-800 p-4">
          {user ? (
            <div className="flex items-end gap-2">
              <Avatar
                src={user.user_metadata?.avatar_url}
                username={user.user_metadata?.full_name ?? user.email ?? 'U'}
                userId={user.id}
                className="h-7 w-7 rounded-full text-[10px]"
                chars={1}
              />
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePostComment()
                }}
                placeholder="Add a comment… (Ctrl+Enter to post)"
                rows={1}
                maxLength={1000}
                className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ minHeight: 36, maxHeight: 120 }}
              />
              <button
                onClick={handlePostComment}
                disabled={!commentBody.trim() || posting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-600">
              {onSignIn ? (
                <button
                  onClick={onSignIn}
                  className="text-indigo-400 hover:underline"
                >
                  Sign in
                </button>
              ) : (
                <span className="text-indigo-400">Sign in</span>
              )}
              {' '}to join the conversation
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

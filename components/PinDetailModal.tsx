'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, ThumbsUp, ThumbsDown, Clock, MapPin, Navigation, ExternalLink, Trash2,
  Timer, MessageSquare, Send, ChevronLeft, ChevronRight,
  ImageOff, Calendar, Users, Loader2, Pencil, Check, UserPlus, UserCheck,
  Link2, Share2, Bookmark, BookmarkCheck,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Pin, Comment, PinPhoto, CommunityTag } from '@/lib/types'
import { getSessionId } from '@/lib/session'
import { timeAgo, timeUntil, formatEventDate, voteColorClass, formatVoteCount } from '@/lib/utils'
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
  /** Reflect an edit (title/description/url) back to the list + map */
  onUpdatePin?: (updated: Partial<Pin> & { id: string }) => void
  onSignIn?: () => void
  /** Fly the map to this pin and close the modal */
  onGoToPin?: () => void
  /** User IDs the current user follows */
  followedUserIds?: Set<string>
  /** Toggle following the given user */
  onToggleFollow?: (userId: string) => void
  /** Whether the current user has saved this pin */
  isSaved?: boolean
  /** Toggle saving this pin to the user's bookmarks */
  onToggleSave?: (pinId: string) => void
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
  onUpdatePin,
  onSignIn,
  onGoToPin,
  followedUserIds,
  onToggleFollow,
  isSaved,
  onToggleSave,
}: PinDetailModalProps) {
  // ── Voting ────────────────────────────────────────────────────────────────
  const [userVote, setUserVote] = useState<number>(0)
  const [voting, setVoting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Stable ref — getSessionId() reads/writes localStorage once at mount time
  const sessionId = useRef(getSessionId()).current

  // ── Edit + share ────────────────────────────────────────────────────────────
  const canEdit = canDelete // author, community mod/owner, or site admin
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(pin.title)
  const [editDescription, setEditDescription] = useState(pin.description ?? '')
  const [editUrl, setEditUrl] = useState(pin.url ?? '')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Only render external links that are genuinely http(s)
  const safeUrl = pin.url && /^https?:\/\//i.test(pin.url) ? pin.url : null

  useEffect(() => {
    // Reset edit state whenever the pin changes
    setEditing(false)
    setEditTitle(pin.title)
    setEditDescription(pin.description ?? '')
    setEditUrl(pin.url ?? '')
    setEditError(null)
  }, [pin.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || savingEdit) return
    setSavingEdit(true)
    setEditError(null)
    const { data, error } = await supabase.rpc('update_pin', {
      p_pin_id: pin.id,
      p_title: editTitle.trim(),
      p_description: editDescription.trim() || null,
      p_url: editUrl.trim() || null,
    })
    setSavingEdit(false)
    if (error) {
      setEditError(error.message.replace(/^.*?:\s*/, '') || 'Could not save changes')
      return
    }
    const row = (Array.isArray(data) ? data[0] : data) as Pin | null
    onUpdatePin?.({
      id: pin.id,
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      url: editUrl.trim() || null,
      ...(row ?? {}),
    })
    setEditing(false)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?pin=${pin.id}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — ignore */ }
  }

  // ── RSVP (events) ─────────────────────────────────────────────────────────
  const [rsvpCount, setRsvpCount] = useState(0)
  const [userGoing, setUserGoing] = useState(false)
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [rsvpToggling, setRsvpToggling] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)
  const isEventPast = pin.event_date ? new Date(pin.event_date) < new Date() : false

  // Batch: vote status + photos + tags — three independent reads, one Promise.all per pin open
  useEffect(() => {
    // Reset all synchronously before the fetches land
    setUserVote(0)
    setConfirmDelete(false)
    setPhotos([])
    setPhotoIndex(0)
    setPhotoError(false)
    setPinTags([])
    setEditingTags(false)
    setCommunityTags([])

    Promise.all([
      // Voting is authenticated + one-per-user; read this user's vote (if any)
      user
        ? supabase
            .from('votes')
            .select('value')
            .eq('pin_id', pin.id)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('pin_photos')
        .select('*')
        .eq('pin_id', pin.id)
        .order('created_at'),
      supabase
        .from('pin_tags')
        .select('tag:community_tags(id, community_id, name, created_by, created_at)')
        .eq('pin_id', pin.id)
        .order('tag(name)'),
    ]).then(([voteRes, photosRes, tagsRes]) => {
      setUserVote((voteRes.data as { value: number } | null)?.value ?? 0)
      if (photosRes.data) setPhotos(photosRes.data as PinPhoto[])
      if (tagsRes.data) {
        const tags = (tagsRes.data as unknown as { tag: CommunityTag | CommunityTag[] }[])
          .map((r) => (Array.isArray(r.tag) ? r.tag[0] : r.tag))
          .filter((t): t is CommunityTag => !!t)
        setPinTags(tags)
      }
    })
  }, [pin.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load RSVP count + user's status whenever the pin changes
  useEffect(() => {
    if (!pin.event_date) return
    setRsvpCount(0)
    setUserGoing(false)
    setRsvpError(null)
    setRsvpLoading(true)

    const fetchRsvps = async () => {
      const [{ count }, userRow] = await Promise.all([
        supabase
          .from('event_rsvps')
          .select('id', { count: 'exact', head: true })
          .eq('pin_id', pin.id),
        user
          ? supabase
              .from('event_rsvps')
              .select('id')
              .eq('pin_id', pin.id)
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setRsvpCount(count ?? 0)
      setUserGoing(!!(userRow.data))
      setRsvpLoading(false)
    }
    fetchRsvps()
  }, [pin.id, pin.event_date, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRsvp = async () => {
    if (!user) { onSignIn?.(); return }
    if (rsvpToggling) return
    setRsvpToggling(true)
    setRsvpError(null)
    const { data, error } = await supabase.rpc('toggle_event_rsvp', { p_pin_id: pin.id })
    setRsvpToggling(false)
    if (error) {
      if (error.message?.includes('full')) setRsvpError('This event is full')
    } else if (data) {
      const result = data as { going: boolean; rsvp_count: number }
      setUserGoing(result.going)
      setRsvpCount(result.rsvp_count)
    }
  }

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

  // ── Tags (inline editing) ────────────────────────────────────────────────
  // pinTags / photos / vote are fetched in the batched effect above.
  const [pinTags, setPinTags] = useState<CommunityTag[]>([])
  const [editingTags, setEditingTags] = useState(false)
  const [communityTags, setCommunityTags] = useState<CommunityTag[]>([])
  const [loadingCommunityTags, setLoadingCommunityTags] = useState(false)
  const [togglingTagId, setTogglingTagId] = useState<string | null>(null)

  // Fetch the community's full tag vocabulary when the editor is opened
  useEffect(() => {
    if (!editingTags || communityTags.length > 0) return
    setLoadingCommunityTags(true)
    supabase
      .from('community_tags')
      .select('*')
      .eq('community_id', pin.community_id)
      .order('name')
      .then(({ data }) => {
        setCommunityTags((data ?? []) as CommunityTag[])
        setLoadingCommunityTags(false)
      })
  }, [editingTags]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleExistingTag = async (tag: CommunityTag) => {
    if (togglingTagId) return
    setTogglingTagId(tag.id)
    const isApplied = pinTags.some((t) => t.id === tag.id)
    if (isApplied) {
      await supabase.from('pin_tags').delete().eq('pin_id', pin.id).eq('tag_id', tag.id)
      setPinTags((prev) => prev.filter((t) => t.id !== tag.id))
    } else {
      const { error } = await supabase.from('pin_tags').insert({ pin_id: pin.id, tag_id: tag.id })
      if (!error) {
        setPinTags((prev) =>
          [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))
        )
      }
    }
    setTogglingTagId(null)
  }

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
  const voteColor = voteColorClass(pin.vote_count)
  const currentPhoto = photos[photoIndex]

  return (
    /* Full-screen backdrop — bottom sheet on mobile, centred modal on sm+ */
    <div
      className="absolute inset-0 z-[1200] flex items-end bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full flex-col overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>
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
            {/* Save / bookmark */}
            {onToggleSave && (
              <button
                onClick={() => onToggleSave(pin.id)}
                title={isSaved ? 'Saved — tap to remove' : 'Save pin'}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  isSaved ? 'text-indigo-400' : 'text-gray-500 hover:bg-gray-800 hover:text-indigo-400'
                }`}
              >
                {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
              </button>
            )}
            {/* Share / copy link — available to everyone */}
            <button
              onClick={handleCopyLink}
              title="Copy link to this pin"
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                copied ? 'text-green-400' : 'text-gray-500 hover:bg-gray-800 hover:text-indigo-400'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
            </button>
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                title="Edit pin"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-800 hover:text-indigo-400"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
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
            {onGoToPin && (
              <button
                onClick={() => { onGoToPin(); onClose() }}
                title="Go to pin on map"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-indigo-400"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Go to pin</span>
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
            {/* Pin title + metadata (or inline edit form) */}
            {editing ? (
              <div className="mb-4 space-y-2.5">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  placeholder="Title"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-semibold text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Details (optional)"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="url"
                  inputMode="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  maxLength={500}
                  placeholder="https://… (optional link)"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {editError && <p className="text-xs text-red-400">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(false)
                      setEditTitle(pin.title)
                      setEditDescription(pin.description ?? '')
                      setEditUrl(pin.url ?? '')
                      setEditError(null)
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-200"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editTitle.trim() || savingEdit}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <h3 className="text-lg font-semibold text-white">{pin.title}</h3>
            )}
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
              {/* Follow author — hidden on your own pins */}
              {pin.user_id && onToggleFollow && (!user || user.id !== pin.user_id) && (() => {
                const following = !!followedUserIds?.has(pin.user_id!)
                return (
                  <button
                    onClick={() => {
                      if (!user) { onSignIn?.(); return }
                      onToggleFollow(pin.user_id!)
                    }}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      following
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
                        : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                    }`}
                  >
                    {following
                      ? <><UserCheck className="h-3 w-3" /> Following</>
                      : <><UserPlus className="h-3 w-3" /> Follow</>}
                  </button>
                )
              })()}
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

            {/* ── Tags ────────────────────────────────────────────────── */}
            {(pinTags.length > 0 || canDelete) && (
              <div className="mb-4">
                {/* Header row */}
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Tags</span>
                  {canDelete && (
                    <button
                      onClick={() => setEditingTags((v) => !v)}
                      className="ml-auto flex items-center gap-1 text-xs text-gray-600 transition-colors hover:text-indigo-400"
                    >
                      {editingTags ? (
                        <><Check className="h-3 w-3" /> Done</>
                      ) : (
                        <><Pencil className="h-3 w-3" /> {pinTags.length > 0 ? 'Edit' : 'Add tags'}</>
                      )}
                    </button>
                  )}
                </div>

                {/* Editor mode: all community tags as toggle chips */}
                {editingTags ? (
                  loadingCommunityTags ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </div>
                  ) : communityTags.length === 0 ? (
                    <p className="text-xs italic text-gray-600">
                      No tags defined for this community yet. Ask a mod to add some in Community Settings → Tags.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {communityTags.map((tag) => {
                        const applied = pinTags.some((t) => t.id === tag.id)
                        const color = community?.color ?? '#6366f1'
                        const toggling = togglingTagId === tag.id
                        return (
                          <button
                            key={tag.id}
                            onClick={() => handleToggleExistingTag(tag)}
                            disabled={!!togglingTagId}
                            className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all disabled:opacity-50"
                            style={
                              applied
                                ? { borderColor: color, backgroundColor: color + '22', color }
                                : { borderColor: '#374151', color: '#9ca3af' }
                            }
                          >
                            {toggling ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : applied ? (
                              <Check className="h-3 w-3" />
                            ) : null}
                            {tag.name}
                          </button>
                        )
                      })}
                    </div>
                  )
                ) : pinTags.length > 0 ? (
                  /* Read-only chips */
                  <div className="flex flex-wrap gap-1.5">
                    {pinTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          borderColor: (community?.color ?? '#6366f1') + '60',
                          color: community?.color ?? '#818cf8',
                          backgroundColor: (community?.color ?? '#6366f1') + '18',
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  /* canDelete but no tags and not editing: nothing shown in the chip area */
                  <p className="text-xs italic text-gray-600">None — click &ldquo;Add tags&rdquo; to tag this pin</p>
                )}
              </div>
            )}

            {!editing && pin.description && (
              <p className="mb-4 text-sm leading-relaxed text-gray-400">{pin.description}</p>
            )}

            {/* External link */}
            {!editing && safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={(e) => e.stopPropagation()}
                className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{safeUrl.replace(/^https?:\/\/(www\.)?/i, '')}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
            )}

            {/* ── Event RSVP card ─────────────────────────────────────── */}
            {pin.event_date && (
              <div className="mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white leading-snug">
                      {formatEventDate(pin.event_date, pin.event_end_date)}
                    </p>
                    {isEventPast && (
                      <span className="mt-0.5 block text-xs text-amber-500">Past event</span>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                      {/* Attendee count */}
                      <span className="flex items-center gap-1.5 text-sm text-gray-400">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        {rsvpLoading ? (
                          <span className="h-3 w-16 rounded bg-gray-800 animate-pulse inline-block" />
                        ) : pin.event_capacity ? (
                          <>{rsvpCount} / {pin.event_capacity} going</>
                        ) : (
                          <>{rsvpCount} going</>
                        )}
                      </span>

                      {/* RSVP button */}
                      {!isEventPast && (
                        user ? (
                          <button
                            onClick={handleRsvp}
                            disabled={rsvpToggling || (!userGoing && !!pin.event_capacity && rsvpCount >= pin.event_capacity)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-60 ${
                              userGoing
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                                : (!pin.event_capacity || rsvpCount < pin.event_capacity)
                                  ? 'bg-gray-800 text-gray-300 hover:bg-indigo-600/20 hover:text-indigo-300'
                                  : 'cursor-not-allowed bg-gray-800 text-gray-600'
                            }`}
                          >
                            {rsvpToggling ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : userGoing ? (
                              <>✓ Going</>
                            ) : (!pin.event_capacity || rsvpCount < pin.event_capacity) ? (
                              <>Going?</>
                            ) : (
                              <>Full</>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => onSignIn?.()}
                            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:bg-indigo-600/20 hover:text-indigo-300"
                          >
                            Sign in to RSVP
                          </button>
                        )
                      )}
                    </div>

                    {rsvpError && (
                      <p className="mt-2 text-xs text-red-400">{rsvpError}</p>
                    )}
                  </div>
                </div>
              </div>
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
                      {formatVoteCount(pin.vote_count)}
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
                      {formatVoteCount(pin.vote_count)}
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

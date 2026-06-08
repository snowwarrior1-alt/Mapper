'use client'

import { useState, useEffect } from 'react'
import { Globe, Lock, Loader2, X, AlertTriangle, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDebounce } from '@/lib/hooks'
import { DEBOUNCE_MS, LIMITS } from '@/lib/constants'

// ── Picker data ──────────────────────────────────────────────────────────────

const EMOJIS = [
  // Nature & wildlife
  '🐦', '🦋', '🌸', '🌿', '🍄', '🌊', '🌙', '⭐',
  '🦁', '🐬', '🦅', '🌺', '🦊', '🐸', '🌻', '🍀',
  // Places & landmarks
  '🏔️', '🏖️', '🗺️', '🏛️', '⛺', '🗼', '🏠', '🎪',
  // Food & drink
  '🌮', '🍕', '☕', '🍺', '🥗', '🍜', '🍦', '🦪',
  // Activities & culture
  '🎨', '🎵', '📚', '🚴', '🎮', '🧗', '🏊',
  // Transport & services
  '🚗', '✈️', '🚂', '🚻', '📶', '🏥', '⛽',
]

const COLORS = [
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#78716c', // stone
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'community'
  // append a short random suffix so slugs stay unique
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CreateCommunityModalProps {
  userId: string
  onClose: () => void
  /** Called with the new community's ID so the parent can auto-select it */
  onSuccess: (newCommunityId: string) => void
}

export default function CreateCommunityModal({
  userId,
  onClose,
  onSuccess,
}: CreateCommunityModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState(EMOJIS[0])
  const [color, setColor] = useState(COLORS[0])
  const [isPrivate, setIsPrivate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Similarity check state
  const [similarCommunities, setSimilarCommunities] = useState<{ id: string; name: string; icon: string }[]>([])
  const [checking, setChecking] = useState(false)

  const trimmedName = name.trim()
  const previewName = trimmedName || 'My Community'

  // Exact match (case-insensitive) blocks submission
  const exactMatch = similarCommunities.find(
    (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
  )

  // Debounce the name — private communities skip the check (no public namespace clash)
  const debouncedName = useDebounce(isPrivate ? '' : trimmedName, DEBOUNCE_MS.similarity)

  // Similarity search — fires after debounce settles
  useEffect(() => {
    if (debouncedName.length < 3) {
      setSimilarCommunities([])
      setChecking(false)
      return
    }

    let cancelled = false
    setChecking(true)
    supabase
      .from('communities')
      .select('id, name, icon')
      .ilike('name', `%${debouncedName}%`)
      .limit(LIMITS.similarCommunities)
      .then(({ data }) => {
        if (cancelled) return
        setSimilarCommunities(data ?? [])
        setChecking(false)
      })
    return () => { cancelled = true }
  }, [debouncedName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('communities')
      .insert({
        name: name.trim(),
        slug: toSlug(name.trim()),
        description: description.trim() || null,
        icon,
        color,
        is_private: isPrivate,
        created_by: userId,
      })
      .select()
      .single()

    if (err || !data) {
      setSubmitting(false)
      setError('Could not create community — please try again.')
      return
    }

    // Auto-add the creator as a moderator so they appear in the Mods tab
    await supabase.from('community_moderators').insert({
      community_id: data.id,
      user_id: userId,
      assigned_by: userId,
    })

    setSubmitting(false)
    onSuccess(data.id)
  }

  return (
    <div
      className="absolute inset-0 z-[1250] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full overflow-y-auto overflow-x-hidden rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-lg sm:rounded-2xl" style={{ maxHeight: '90dvh' }}>
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-center gap-2">
            {isPrivate
              ? <Lock className="h-4 w-4 text-indigo-400" />
              : <Globe className="h-4 w-4 text-indigo-400" />}
            <h2 className="font-semibold text-white">New Community</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          {/* ── Privacy toggle ── */}
          <div>
            <label className="mb-2 block text-sm text-gray-400">Visibility</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                  !isPrivate
                    ? 'border-indigo-500 bg-indigo-600/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Globe className={`h-3.5 w-3.5 ${!isPrivate ? 'text-indigo-400' : 'text-gray-500'}`} />
                  <span className={`text-sm font-medium ${!isPrivate ? 'text-indigo-300' : 'text-gray-400'}`}>
                    Public
                  </span>
                </div>
                <p className="text-xs text-gray-600">Anyone can see and find this map</p>
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                  isPrivate
                    ? 'border-indigo-500 bg-indigo-600/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Lock className={`h-3.5 w-3.5 ${isPrivate ? 'text-indigo-400' : 'text-gray-500'}`} />
                  <span className={`text-sm font-medium ${isPrivate ? 'text-indigo-300' : 'text-gray-400'}`}>
                    Private
                  </span>
                </div>
                <p className="text-xs text-gray-600">Invite-only — invisible to everyone else</p>
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">
              Community name <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isPrivate ? 'e.g. Where My Friends Live, Fav Bars…' : 'e.g. Skate Parks, Jazz Bars, Dog Walks…'}
                maxLength={50}
                autoFocus
                required
                className={`w-full rounded-lg border bg-gray-800 px-3 py-2.5 pr-8 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 ${
                  exactMatch
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : similarCommunities.length > 0
                    ? 'border-yellow-500/60 focus:border-yellow-500 focus:ring-yellow-500'
                    : 'border-gray-700 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {(checking || (trimmedName !== debouncedName && !isPrivate && trimmedName.length >= 3)) && (
                <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-500" />
              )}
            </div>

            {/* Exact duplicate — block creation */}
            {exactMatch && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="text-sm">
                  <p className="font-medium text-red-300">This community already exists</p>
                  <p className="mt-0.5 text-red-400/80">
                    {exactMatch.icon} {exactMatch.name} — try a more specific name like adding your city.
                  </p>
                </div>
              </div>
            )}

            {/* Similar communities — warn but allow */}
            {!exactMatch && similarCommunities.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-300">Similar communities exist</p>
                  <p className="mt-1 text-yellow-400/80">
                    {similarCommunities.map((c) => `${c.icon} ${c.name}`).join(', ')}
                  </p>
                  <p className="mt-1 text-yellow-400/60">
                    You can still create yours if it covers a different area or focus.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">
              Description{' '}
              <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will people pin here?"
              maxLength={120}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Emoji picker */}
          <div>
            <label className="mb-2 block text-sm text-gray-400">Icon</label>
            <div className="grid grid-cols-8 gap-1 rounded-xl border border-gray-700 bg-gray-800 p-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-all ${
                    icon === e
                      ? 'bg-gray-600 ring-2 ring-indigo-500'
                      : 'hover:bg-gray-700'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="mb-2 block text-sm text-gray-400">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: '3px',
                    boxShadow: color === c ? '0 0 0 5px #111827' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
              Preview
            </p>
            <div className="flex items-center gap-3 rounded-lg bg-gray-800 px-3 py-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                style={{
                  backgroundColor: color + '22',
                  border: `2px solid ${color}`,
                }}
              >
                {icon}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-white">
                {previewName}
              </span>
              {isPrivate && (
                <Lock className="h-3 w-3 shrink-0 text-gray-500" />
              )}
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                0
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmedName || submitting || !!exactMatch || checking || (trimmedName !== debouncedName && !isPrivate && trimmedName.length >= 3)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create Community'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Globe, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Picker data ──────────────────────────────────────────────────────────────

const EMOJIS = [
  // Nature & wildlife
  '🐦', '🦋', '🌸', '🌿', '🍄', '🌊', '🌙', '⭐',
  '🦁', '🐬', '🦅', '🌺', '🦊', '🐸', '🌻', '🍀',
  // Places & landmarks
  '🏔️', '🏖️', '🗺️', '🏛️', '⛺', '🗼', '🏠', '🎪',
  // Food & drink
  '🌮', '🍕', '☕', '🍺', '🥗', '🍜', '🍦',
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewName = name.trim() || 'My Community'

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
        created_by: userId,
      })
      .select()
      .single()

    setSubmitting(false)

    if (err) {
      setError('Could not create community — please try again.')
    } else if (data) {
      onSuccess(data.id)
    }
  }

  return (
    <div
      className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-indigo-400" />
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
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">
              Community name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Skate Parks, Jazz Bars, Dog Walks…"
              maxLength={50}
              autoFocus
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
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
              disabled={!name.trim() || submitting}
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

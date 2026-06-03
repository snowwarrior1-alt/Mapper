'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Loader2, MapPin, LocateFixed, Check, Plus, Zap, ChevronRight, Lock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Community } from '@/lib/types'
import { canUserPinInCommunity } from '@/lib/utils'
import { reverseGeocode, formatAddress, nearbyPlaces, formatDistance, type NearbyPlace } from '@/lib/geo'

const LAST_COMMUNITY_KEY = 'lastCommunityId'

// ── Component ─────────────────────────────────────────────────────────────────

interface QuickAddSheetProps {
  communities: Community[]
  userId: string | null
  subscribedIds: Set<string>
  moderatedIds: Set<string>
  /** Community currently in focus (used as the default if pinnable) */
  preferredCommunityId: string | null
  onClose: () => void
  onSuccess: () => void
  onSignIn: () => void
  /** Hand off to the full Add Pin modal with everything pre-filled */
  onMoreOptions: (lat: number, lng: number, title: string, communityId: string | null) => void
}

export default function QuickAddSheet({
  communities,
  userId,
  subscribedIds,
  moderatedIds,
  preferredCommunityId,
  onClose,
  onSuccess,
  onSignIn,
  onMoreOptions,
}: QuickAddSheetProps) {
  const pinnable = communities.filter((c) => canUserPinInCommunity(c, userId, subscribedIds, moderatedIds))

  // Default community: focused → last-used → first pinnable
  const [communityId, setCommunityId] = useState<string>(() => {
    const last = typeof window !== 'undefined' ? localStorage.getItem(LAST_COMMUNITY_KEY) : null
    const candidates = [preferredCommunityId, last].filter(Boolean) as string[]
    for (const id of candidates) if (pinnable.some((c) => c.id === id)) return id
    return pinnable[0]?.id ?? ''
  })

  const [locating, setLocating] = useState(true)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<NearbyPlace[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Chosen target: 'me' = raw GPS point, or a suggestion key
  const [chosenKey, setChosenKey] = useState<string>('me')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const selectedCommunity = communities.find((c) => c.id === communityId)

  // ── 1. Get GPS, then reverse-geocode + fetch nearby POIs ──────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocating(false)
      setGeoError('Geolocation is not supported on this device')
      return
    }
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        if (cancelled) return
        const lat = c.latitude, lng = c.longitude
        setCoords({ lat, lng })
        setLocating(false)
        void loadAround(lat, lng)
      },
      (err) => {
        if (cancelled) return
        setLocating(false)
        setGeoError(
          err.code === 1 ? 'Location access denied — enable it or use “More options”.'
          : err.code === 2 ? 'Location unavailable right now.'
          : 'Location timed out.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadAround = async (lat: number, lng: number) => {
    setLoadingSuggestions(true)
    const [reverse, places] = await Promise.all([
      reverseGeocode(lat, lng),
      nearbyPlaces(lat, lng),
    ])
    setAddress(formatAddress(reverse, 2))
    setSuggestions(places)
    setLoadingSuggestions(false)
  }

  // ── 2. Resolve the chosen target ──────────────────────────────────────────
  const chosenSuggestion = suggestions.find((s) => s.key === chosenKey)
  const targetLat = chosenSuggestion?.lat ?? coords?.lat ?? null
  const targetLng = chosenSuggestion?.lng ?? coords?.lng ?? null

  const chooseSuggestion = (s: NearbyPlace) => {
    setChosenKey(s.key)
    setTitle(s.name) // pre-fill the title with the place name
    titleRef.current?.focus()
  }

  const chooseMyLocation = () => {
    setChosenKey('me')
    setTitle('')
  }

  // ── 3. Submit ─────────────────────────────────────────────────────────────
  const canSubmit = !!title.trim() && !!communityId && targetLat != null && !submitting

  const handleSubmit = async () => {
    if (!canSubmit || targetLat == null || targetLng == null) return
    setSubmitting(true)
    setError(null)
    const { error: insErr } = await supabase.from('pins').insert({
      community_id: communityId,
      user_id: userId,
      title: title.trim(),
      lat: targetLat,
      lng: targetLng,
      vote_count: 0,
    })
    setSubmitting(false)
    if (insErr) {
      setError(insErr.message.includes('Rate limit')
        ? 'You’re adding pins too fast — give it a moment.'
        : 'Could not add pin — please try again.')
      return
    }
    localStorage.setItem(LAST_COMMUNITY_KEY, communityId)
    onSuccess()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="absolute inset-0 z-[1200] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full flex-col overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-md sm:rounded-2xl" style={{ maxHeight: '90vh' }}>
        {/* Drag handle — mobile */}
        <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-400" />
            <h2 className="font-semibold text-white">Quick add</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* No pinnable communities */}
          {pinnable.length === 0 ? (
            <div className="py-6 text-center">
              <Lock className="mx-auto mb-2 h-7 w-7 text-gray-600" />
              <p className="text-sm text-gray-400">
                {userId ? 'You can’t pin in any community yet — subscribe to one first.' : 'Sign in to drop pins.'}
              </p>
              {!userId && (
                <button onClick={onSignIn} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
                  Sign in
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Community */}
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">Community</label>
                <div className="flex flex-wrap gap-2">
                  {pinnable.map((c) => {
                    const active = c.id === communityId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCommunityId(c.id)}
                        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
                        style={active
                          ? { borderColor: c.color, backgroundColor: c.color + '22', color: '#fff' }
                          : { borderColor: '#374151', color: '#9ca3af' }}
                      >
                        <span>{c.icon}</span>
                        <span className="max-w-[10rem] truncate">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Where are you? */}
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">Where are you?</label>

                {locating ? (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Finding your location…
                  </div>
                ) : geoError ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-400">
                    {geoError}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* My exact location */}
                    <button
                      type="button"
                      onClick={chooseMyLocation}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        chosenKey === 'me' ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <LocateFixed className={`h-4 w-4 shrink-0 ${chosenKey === 'me' ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">My exact location</p>
                        <p className="truncate text-xs text-gray-500">{address ?? 'Dropped at your GPS position'}</p>
                      </div>
                      {chosenKey === 'me' && <Check className="h-4 w-4 shrink-0 text-indigo-400" />}
                    </button>

                    {/* Nearby suggestions */}
                    {loadingSuggestions && suggestions.length === 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for places nearby…
                      </div>
                    )}
                    {suggestions.map((s) => {
                      const active = chosenKey === s.key
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => chooseSuggestion(s)}
                          className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                            active ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <MapPin className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-400' : 'text-gray-500'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{s.name}</p>
                            <p className="truncate text-xs capitalize text-gray-500">{s.category} · {formatDistance(s.dist)}</p>
                          </div>
                          {active && <Check className="h-4 w-4 shrink-0 text-indigo-400" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="mb-1 block text-sm text-gray-400">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selectedCommunity ? `What’s here? (${selectedCommunity.name})` : 'What is here?'}
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {!userId && selectedCommunity && (
                <p className="text-xs text-gray-500">Posting anonymously.</p>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        {pinnable.length > 0 && (
          <div className="shrink-0 border-t border-gray-800 px-5 py-4">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add pin
            </button>
            <button
              onClick={() => onMoreOptions(targetLat ?? 0, targetLng ?? 0, title.trim(), communityId || null)}
              disabled={targetLat == null}
              className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300 disabled:opacity-40"
            >
              More options (photos, event, details)
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

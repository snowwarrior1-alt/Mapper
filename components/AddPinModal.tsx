'use client'

import { useState, useRef, useEffect } from 'react'
import { X, MapPin, Loader2, Lock, Clock, CheckCircle2, ImagePlus, XCircle, Search, AlertTriangle, LogIn, Calendar, Users, Check, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Community, CommunityTag, WHO_CAN_PIN_LABELS, GeoRestriction } from '@/lib/types'
import { LIMITS, DEBOUNCE_MS } from '@/lib/constants'
import { useDebounce } from '@/lib/hooks'
import { canUserPinInCommunity } from '@/lib/utils'

// ── Nominatim result shape ────────────────────────────────────────────────────

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DURATION_SHORT: Record<string, string> = {
  '1d': '24 h', '7d': '7 d', '30d': '30 d', '90d': '90 d',
}

function randomHex(len = 8) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AddPinModalProps {
  lat: number
  lng: number
  communities: Community[]
  initialCommunityId: string | null
  /** Pre-fill the title and location fields (e.g. from the map search bar) */
  initialTitle?: string
  /** null for anonymous / unauthenticated users */
  userId: string | null
  subscribedIds: Set<string>
  moderatedIds: Set<string>
  onClose: () => void
  onSuccess: () => void
  /** Called when the user taps "Sign in" inside the modal */
  onSignIn?: () => void
  /** Open the create-community flow (from the "+ New community" picker button) */
  onCreateCommunity?: () => void
  /** When set, AddPinModal switches its selected community to this id (e.g. after
   *  creating a new one) without losing the title/details already entered */
  selectCommunityId?: string | null
}

export default function AddPinModal({
  lat,
  lng,
  communities,
  initialCommunityId,
  initialTitle,
  userId,
  subscribedIds,
  moderatedIds,
  onClose,
  onSuccess,
  onSignIn,
  onCreateCommunity,
  selectCommunityId,
}: AddPinModalProps) {
  const [communityId, setCommunityId] = useState(
    initialCommunityId ?? communities[0]?.id ?? ''
  )
  // Filter box for the community picker (helps when there are many communities)
  const [communityQuery, setCommunityQuery] = useState('')

  // Switch to a community chosen elsewhere (e.g. just created), once it's loaded
  useEffect(() => {
    if (selectCommunityId && communities.some((c) => c.id === selectCommunityId)) {
      setCommunityId(selectCommunityId)
    }
  }, [selectCommunityId, communities])
  const [title, setTitle] = useState(initialTitle ?? '')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Community tags ────────────────────────────────────────────────────────
  const [availableTags, setAvailableTags] = useState<CommunityTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [loadingTags, setLoadingTags] = useState(false)

  useEffect(() => {
    if (!communityId) return
    setSelectedTagIds(new Set())
    setAvailableTags([])
    setLoadingTags(true)
    supabase
      .from('community_tags')
      .select('*')
      .eq('community_id', communityId)
      .order('name')
      .then(({ data }) => {
        setAvailableTags((data ?? []) as CommunityTag[])
        setLoadingTags(false)
      })
  }, [communityId])

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  // ── Event / meetup fields ─────────────────────────────────────────────────
  const [isEvent, setIsEvent] = useState(false)
  const [eventDate, setEventDate] = useState('')
  const [eventEndDate, setEventEndDate] = useState('')
  const [eventCapacity, setEventCapacity] = useState('')

  // ── Location overridable from address search ──────────────────────────────
  const [pinLat, setPinLat] = useState(lat)
  const [pinLng, setPinLng] = useState(lng)

  // ── Address / place search ─────────────────────────────────────────────────
  const [locationQuery, setLocationQuery] = useState(initialTitle ?? '')
  const [locationResults, setLocationResults] = useState<NominatimResult[]>([])
  const [locationFetching, setLocationFetching] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  // Pre-select the place when opened from the map search bar
  const [selectedPlace, setSelectedPlace] = useState<string | null>(initialTitle ?? null)
  // True after a result is selected (or when pre-filled from the map search);
  // blocks the dropdown from reopening until the user types. Cleared only in onChange.
  const suppressLocationSearch = useRef(Boolean(initialTitle))

  const debouncedLocationQuery = useDebounce(locationQuery.trim(), DEBOUNCE_MS.geocode)

  useEffect(() => {
    // A result was just selected (or the field was pre-filled). Stay closed
    // until the user types again — onChange is the only thing that clears this.
    if (suppressLocationSearch.current) {
      setLocationFetching(false)
      return
    }
    if (!debouncedLocationQuery) {
      setLocationResults([])
      setLocationOpen(false)
      return
    }
    const controller = new AbortController()
    setLocationFetching(true)
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=${LIMITS.geocodeResults}&q=${encodeURIComponent(debouncedLocationQuery)}`,
      { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data: NominatimResult[]) => {
        if (suppressLocationSearch.current) return // a selection landed while in flight
        setLocationResults(data)
        setLocationOpen(data.length > 0)
      })
      .catch((err) => { if (err.name !== 'AbortError') setLocationResults([]) })
      .finally(() => setLocationFetching(false))
    return () => controller.abort()
  }, [debouncedLocationQuery])

  const handleLocationSelect = (result: NominatimResult) => {
    const newLat = parseFloat(result.lat)
    const newLng = parseFloat(result.lon)
    setPinLat(newLat)
    setPinLng(newLng)
    // Use a short place label — everything before the first comma
    const shortName = result.display_name.split(',')[0].trim()
    suppressLocationSearch.current = true // don't re-search the name we just picked
    setSelectedPlace(shortName)
    setLocationQuery(shortName)
    setLocationOpen(false)
    setLocationResults([])
    // Auto-fill title with the place name if user hasn't typed anything yet
    if (!title.trim()) setTitle(shortName)
  }

  const selectedCommunity = communities.find((c) => c.id === communityId)
  const isPending = selectedCommunity?.require_approval ?? false
  const hasDuration = selectedCommunity?.default_pin_duration !== 'permanent'
  const durationLabel = selectedCommunity ? DURATION_SHORT[selectedCommunity.default_pin_duration] ?? null : null
  const userCanPin = selectedCommunity ? canUserPinInCommunity(selectedCommunity, userId, subscribedIds, moderatedIds) : true

  // ── Geographic restriction check ─────────────────────────────────────────
  const geoRestriction: GeoRestriction | null = selectedCommunity?.geo_restriction ?? null
  const isOutsideGeo = geoRestriction !== null
    ? (pinLat < geoRestriction.south || pinLat > geoRestriction.north ||
       pinLng < geoRestriction.west  || pinLng > geoRestriction.east)
    : false

  // Pin needs mod approval if the community requires it OR the pin is outside the geo area
  const effectivePending = isPending || isOutsideGeo

  // ── Photo selection ───────────────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const combined = [...photos, ...files].slice(0, LIMITS.photosPerPin)
    // Generate previews first, then update both states together to keep them in sync
    Promise.all(
      combined.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = (ev) => resolve(ev.target?.result as string)
            reader.readAsDataURL(f)
          })
      )
    ).then((previews) => {
      setPhotos(combined)
      setPhotoPreviews(previews)
    })
    // Reset the input so the same file can be re-selected if removed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !communityId || !userCanPin) return

    setSubmitting(true)
    setError(null)

    // Step 1: Insert the pin (status + expires_at set by DB trigger)
    const { data: pinData, error: pinErr } = await supabase
      .from('pins')
      .insert({
        community_id: communityId,
        user_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
        lat: pinLat,
        lng: pinLng,
        vote_count: 0,
        // Event fields (null when not an event)
        event_date:     isEvent && eventDate    ? new Date(eventDate).toISOString()    : null,
        event_end_date: isEvent && eventEndDate ? new Date(eventEndDate).toISOString() : null,
        event_capacity: isEvent && eventCapacity ? parseInt(eventCapacity, 10) : null,
      })
      .select('id')
      .single()

    if (pinErr || !pinData) {
      setError('Could not add pin — please try again.')
      setSubmitting(false)
      return
    }

    const pinId = pinData.id

    // Remember the community for the next quick-add default
    try { localStorage.setItem('lastCommunityId', communityId) } catch { /* ignore */ }

    // Step 2: Upload photos (only for authenticated users)
    if (photos.length > 0 && userId) {
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}…`)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${userId}/${pinId}/${randomHex()}.${ext}`

        const { error: storageErr } = await supabase.storage
          .from('pin-photos')
          .upload(path, file, { cacheControl: '31536000', upsert: false })

        if (storageErr) continue // skip failed uploads, don't abort the whole submit

        const { data: { publicUrl } } = supabase.storage
          .from('pin-photos')
          .getPublicUrl(path)

        const { error: dbErr } = await supabase.from('pin_photos').insert({
          pin_id: pinId,
          user_id: userId,
          url: publicUrl,
        })
        if (dbErr) console.error('Failed to record photo:', dbErr)
      }
    }

    // Step 3: Attach tags (authenticated users only — RLS requires user_id match)
    if (selectedTagIds.size > 0 && userId) {
      const tagRows = Array.from(selectedTagIds).map((tag_id) => ({ pin_id: pinId, tag_id }))
      await supabase.from('pin_tags').insert(tagRows)
    }

    setSubmitting(false)
    setUploadProgress('')

    if (effectivePending) {
      setSubmitted(true)
      setTimeout(() => onSuccess(), 3000)
    } else {
      onSuccess()
    }
  }

  // ── Submitted (pending approval) screen ──────────────────────────────────

  if (submitted) {
    return (
      <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-amber-400" />
          <h3 className="mb-2 text-lg font-bold text-white">Pin submitted!</h3>
          <p className="text-sm text-gray-400">
            Your pin is in the moderation queue. It will appear on the map once a mod approves it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-[1200] flex items-end bg-black/50 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full flex-col overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-900 shadow-2xl sm:max-w-md sm:rounded-2xl" style={{ maxHeight: '90dvh' }}>
        {/* Drag handle — visible on mobile only */}
        <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-indigo-400" />
            <h2 className="font-semibold text-white">Drop a Pin</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Location search */}
            <div className="relative">
              <label className="mb-1.5 block text-sm text-gray-400">Location</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                {locationFetching && (
                  <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-500" />
                )}
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(e) => {
                    suppressLocationSearch.current = false // genuine typing — re-enable searching
                    setLocationQuery(e.target.value)
                    if (selectedPlace && e.target.value !== selectedPlace) setSelectedPlace(null)
                  }}
                  onFocus={() => { if (!suppressLocationSearch.current && locationResults.length > 0) setLocationOpen(true) }}
                  onBlur={() => setTimeout(() => setLocationOpen(false), 150)}
                  placeholder="Search address or place name…"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-9 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Dropdown */}
              {locationOpen && locationResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                  {locationResults.map((result) => (
                    <li key={result.place_id}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleLocationSelect(result) }}
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-800"
                      >
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                        <span className="text-gray-300 leading-snug">{result.display_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Coordinate readout */}
              <p className="mt-1.5 font-mono text-xs text-gray-600">
                📍 {pinLat.toFixed(4)}, {pinLng.toFixed(4)}
                {!selectedPlace && (
                  <span className="ml-2 not-italic text-gray-700 font-sans">(map click)</span>
                )}
              </p>
            </div>

            {/* Community picker */}
            <div>
              <label className="mb-2 block text-sm text-gray-400">Community</label>

              {/* Filter — shown once there are enough communities to be worth it */}
              {communities.length > 8 && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={communityQuery}
                    onChange={(e) => setCommunityQuery(e.target.value)}
                    placeholder={`Filter ${communities.length} communities…`}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {communities
                  .filter((c) => c.name.toLowerCase().includes(communityQuery.trim().toLowerCase()))
                  .map((c) => {
                  const active = communityId === c.id
                  const allowed = canUserPinInCommunity(c, userId, subscribedIds, moderatedIds)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => allowed && setCommunityId(c.id)}
                      disabled={!allowed}
                      className={`relative flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm font-medium transition-all ${
                        !allowed ? 'cursor-not-allowed opacity-40' : ''
                      }`}
                      style={
                        active && allowed
                          ? { backgroundColor: c.color + '22', borderColor: c.color, color: '#fff' }
                          : { borderColor: '#374151', color: '#9ca3af' }
                      }
                    >
                      <span className="text-lg">{c.icon}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      {!allowed && <Lock className="h-3 w-3 shrink-0 text-gray-600" />}
                    </button>
                  )
                })}

                {/* + New community — only for signed-in users */}
                {userId && onCreateCommunity && (
                  <button
                    type="button"
                    onClick={onCreateCommunity}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-gray-700 p-2.5 text-left text-sm font-medium text-gray-400 transition-colors hover:border-indigo-500 hover:text-indigo-300"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">New community</span>
                  </button>
                )}
              </div>

              {selectedCommunity && selectedCommunity.who_can_pin !== 'anyone' && (
                <p className="mt-2 flex items-center gap-1 text-xs text-gray-600">
                  <Lock className="h-3 w-3" />
                  {userCanPin
                    ? `Open to ${WHO_CAN_PIN_LABELS[selectedCommunity.who_can_pin].toLowerCase()}`
                    : `Restricted: ${WHO_CAN_PIN_LABELS[selectedCommunity.who_can_pin]}`}
                </p>
              )}
            </div>

            {/* Tag picker — shown only when the community has tags defined */}
            {(loadingTags || availableTags.length > 0) && (
              <div>
                <label className="mb-2 block text-sm text-gray-400">
                  Tags <span className="text-gray-600">(optional)</span>
                </label>
                {loadingTags ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tags…
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => {
                      const selected = selectedTagIds.has(tag.id)
                      const color = selectedCommunity?.color ?? '#6366f1'
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className="rounded-full border px-3 py-1 text-sm font-medium transition-all"
                          style={
                            selected
                              ? { borderColor: color, backgroundColor: color + '22', color }
                              : { borderColor: '#374151', color: '#9ca3af' }
                          }
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedCommunity ? `Title for your ${selectedCommunity.name} pin…` : 'What is here?'}
                maxLength={100}
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Details <span className="text-gray-600">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more info…"
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Link */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Link <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                maxLength={500}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Event toggle */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setIsEvent(!isEvent)
                  if (isEvent) { setEventDate(''); setEventEndDate(''); setEventCapacity('') }
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  isEvent
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                }`}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">
                  {isEvent ? 'This is an event' : 'Make this an event / meetup'}
                </span>
                {isEvent && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>

              {isEvent && (
                <div className="mt-3 space-y-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Start date &amp; time <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      required={isEvent}
                      style={{ colorScheme: 'dark' }}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      End time <span className="text-gray-600">(optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={eventEndDate}
                      onChange={(e) => setEventEndDate(e.target.value)}
                      min={eventDate || undefined}
                      style={{ colorScheme: 'dark' }}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Capacity <span className="text-gray-600">(optional)</span>
                      </span>
                    </label>
                    <input
                      type="number"
                      value={eventCapacity}
                      onChange={(e) => setEventCapacity(e.target.value)}
                      min={1}
                      placeholder="No limit"
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sign-in prompt for anonymous users in restricted communities */}
            {!userId && selectedCommunity && selectedCommunity.who_can_pin !== 'anyone' && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
                <p className="text-sm text-indigo-300">
                  Sign in to pin in <strong className="font-semibold">{selectedCommunity.name}</strong>
                </p>
                {onSignIn && (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    Sign in
                  </button>
                )}
              </div>
            )}

            {/* Photo upload — authenticated users only */}
            {userId && <div>
              <label className="mb-2 block text-sm text-gray-400">
                Photos <span className="text-gray-600">(optional, up to 5)</span>
              </label>

              {photoPreviews.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="h-20 w-20 rounded-lg object-cover border border-gray-700"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 text-gray-400 hover:text-red-400"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {photos.length < LIMITS.photosPerPin && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 py-3 text-sm text-gray-500 transition-colors hover:border-indigo-500 hover:text-indigo-400"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {photos.length === 0 ? 'Add photos' : 'Add more photos'}
                  </button>
                </>
              )}
            </div>}

            {/* Rules preview banners */}
            {selectedCommunity && (
              <div className="space-y-1.5">
                {/* Anonymous posting notice */}
                {!userId && selectedCommunity.who_can_pin === 'anyone' && (
                  <div className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-xs text-gray-400">
                    <LogIn className="h-3.5 w-3.5 shrink-0" />
                    Posting anonymously
                    {onSignIn && (
                      <button type="button" onClick={onSignIn} className="ml-auto text-indigo-400 underline hover:text-indigo-300">
                        Sign in instead
                      </button>
                    )}
                  </div>
                )}
                {/* Geo restriction: pin is outside the area → warn + explain approval */}
                {isOutsideGeo && geoRestriction && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      This location is outside{' '}
                      <strong className="font-semibold">{geoRestriction.name}</strong>.
                      Your pin will need mod approval before appearing on the map.
                    </span>
                  </div>
                )}
                {hasDuration && durationLabel && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    This pin will auto-expire in {durationLabel}
                  </div>
                )}
                {/* Only show the generic pending banner if it's not already covered by the geo warning */}
                {isPending && !isOutsideGeo && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
                    <Loader2 className="h-3.5 w-3.5 shrink-0" />
                    Will go into the mod queue before appearing on the map
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          {/* Actions */}
          <div className="shrink-0 flex gap-3 border-t border-gray-800 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-700 py-3 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !communityId || submitting || !userCanPin || (isEvent && !eventDate)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress || 'Adding…'}
                </>
              ) : isEvent && effectivePending ? (
                'Submit Event for Review'
              ) : isEvent ? (
                <>
                  <Calendar className="h-4 w-4" />
                  Create Event
                </>
              ) : effectivePending ? (
                'Submit for Review'
              ) : (
                'Add Pin'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

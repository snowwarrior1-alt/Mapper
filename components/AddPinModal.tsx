'use client'

import { useState, useRef } from 'react'
import { X, MapPin, Loader2, Lock, Clock, CheckCircle2, ImagePlus, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Community, WHO_CAN_PIN_LABELS } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DURATION_SHORT: Record<string, string> = {
  '1d': '24 h', '7d': '7 d', '30d': '30 d', '90d': '90 d',
}

function canUserPin(
  community: Community,
  subscribedIds: Set<string>,
  moderatedIds: Set<string>,
): boolean {
  if (community.who_can_pin === 'anyone') return true
  if (community.who_can_pin === 'subscribers') return subscribedIds.has(community.id)
  if (community.who_can_pin === 'mods') return moderatedIds.has(community.id)
  return true
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
  userId: string
  subscribedIds: Set<string>
  moderatedIds: Set<string>
  onClose: () => void
  onSuccess: () => void
}

export default function AddPinModal({
  lat,
  lng,
  communities,
  initialCommunityId,
  userId,
  subscribedIds,
  moderatedIds,
  onClose,
  onSuccess,
}: AddPinModalProps) {
  const [communityId, setCommunityId] = useState(
    initialCommunityId ?? communities[0]?.id ?? ''
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedCommunity = communities.find((c) => c.id === communityId)
  const isPending = selectedCommunity?.require_approval ?? false
  const hasDuration = selectedCommunity?.default_pin_duration !== 'permanent'
  const durationLabel = selectedCommunity ? DURATION_SHORT[selectedCommunity.default_pin_duration] ?? null : null
  const userCanPin = selectedCommunity ? canUserPin(selectedCommunity, subscribedIds, moderatedIds) : true

  // ── Photo selection ───────────────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const combined = [...photos, ...files].slice(0, 5) // max 5 photos
    setPhotos(combined)
    // Generate previews
    Promise.all(
      combined.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = (ev) => resolve(ev.target?.result as string)
            reader.readAsDataURL(f)
          })
      )
    ).then(setPhotoPreviews)
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
        lat,
        lng,
        vote_count: 0,
      })
      .select('id')
      .single()

    if (pinErr || !pinData) {
      setError('Could not add pin — please try again.')
      setSubmitting(false)
      return
    }

    const pinId = pinData.id

    // Step 2: Upload photos (if any)
    if (photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}…`)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${userId}/${pinId}/${randomHex()}.${ext}`

        const { error: storageErr } = await supabase.storage
          .from('pin-photos')
          .upload(path, file, { cacheControl: '31536000', upsert: false })

        if (storageErr) continue // skip failed photos, don't abort

        const { data: { publicUrl } } = supabase.storage
          .from('pin-photos')
          .getPublicUrl(path)

        await supabase.from('pin_photos').insert({
          pin_id: pinId,
          user_id: userId,
          url: publicUrl,
        })
      }
    }

    setSubmitting(false)
    setUploadProgress('')

    if (isPending) {
      setSubmitted(true)
      setTimeout(() => onSuccess(), 3000)
    } else {
      onSuccess()
    }
  }

  // ── Submitted (pending approval) screen ──────────────────────────────────

  if (submitted) {
    return (
      <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
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
      className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl" style={{ maxHeight: '90vh' }}>
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
            {/* Coordinates */}
            <p className="font-mono text-xs text-gray-500">
              📍 {lat.toFixed(4)}, {lng.toFixed(4)}
            </p>

            {/* Community picker */}
            <div>
              <label className="mb-2 block text-sm text-gray-400">Community</label>
              <div className="grid grid-cols-2 gap-2">
                {communities.map((c) => {
                  const active = communityId === c.id
                  const allowed = canUserPin(c, subscribedIds, moderatedIds)
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

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedCommunity ? `e.g. "Rare ${selectedCommunity.name} sighting"` : 'What is here?'}
                maxLength={100}
                autoFocus
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

            {/* Photo upload */}
            <div>
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

              {photos.length < 5 && (
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
            </div>

            {/* Rules preview banners */}
            {selectedCommunity && (
              <div className="space-y-1.5">
                {hasDuration && durationLabel && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    This pin will auto-expire in {durationLabel}
                  </div>
                )}
                {isPending && (
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
          <div className="shrink-0 flex gap-3 border-t border-gray-800 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !communityId || submitting || !userCanPin}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress || 'Adding…'}
                </>
              ) : isPending ? (
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

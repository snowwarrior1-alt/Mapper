'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2, MapPin, Plus } from 'lucide-react'
import { useDebounce } from '@/lib/hooks'
import { DEBOUNCE_MS, LIMITS } from '@/lib/constants'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox: string[] // [south, north, west, east]
  type: string
  class: string
}

interface LocationSearchProps {
  onFlyTo: (lat: number, lng: number, zoom: number) => void
  /** When a side panel (e.g. community pins) is open, shift left to avoid overlap */
  panelOpen?: boolean
  /** Called when the user clicks "Add pin" on a searched location */
  onAddPin?: (lat: number, lng: number, placeName: string) => void
}

/**
 * Extract a human-readable short name from a Nominatim display_name.
 * Nominatim splits address components with ", " — the first segment is the
 * most specific part, but for street addresses it's just the house number
 * (e.g. "139, Chrystie Street, Manhattan…" → first part = "139").
 * In that case we combine the house number with the street name.
 */
function extractPrimaryName(displayName: string): string {
  const parts = displayName.split(', ')
  if (parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0].trim())) {
    // First segment is a house/unit number — prepend the street name
    return `${parts[0].trim()} ${parts[1].trim()}`
  }
  return parts[0].trim()
}

/** Derive a sensible zoom from the result's bounding box size. */
function bboxZoom(bb: string[]): number {
  const latSpan = Math.abs(parseFloat(bb[1]) - parseFloat(bb[0]))
  const lngSpan = Math.abs(parseFloat(bb[3]) - parseFloat(bb[2]))
  const span = Math.max(latSpan, lngSpan)
  if (span < 0.008) return 17 // building / block
  if (span < 0.05)  return 15 // neighbourhood
  if (span < 0.2)   return 13 // district / borough
  if (span < 0.8)   return 11 // city
  if (span < 3)     return 9  // metro area / county
  if (span < 12)    return 7  // state / region
  if (span < 40)    return 5  // large country
  return 3                     // continent / world
}

export default function LocationSearch({ onFlyTo, panelOpen = false, onAddPin }: LocationSearchProps) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<NominatimResult[]>([])
  const [fetching, setFetching] = useState(false)
  const [open, setOpen]         = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [pinCandidate, setPinCandidate] = useState<{ lat: number; lng: number; name: string } | null>(null)

  const inputRef      = useRef<HTMLInputElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  // Set to true immediately after a result is selected so the debounce effect
  // can skip the fetch that would otherwise fire with the shortened query name.
  const justSelected  = useRef(false)

  // Debounce the trimmed query — replaces the manual useRef + setTimeout pattern
  const debouncedQuery = useDebounce(query.trim(), DEBOUNCE_MS.geocode)

  // Show a spinner as soon as the user types, not only after the debounce fires
  const isPending = query.trim().length >= 2 && query.trim() !== debouncedQuery
  const showSpinner = isPending || fetching

  // ── Geocoding fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    // Skip the fetch that fires right after the user selects a result —
    // we've already got the data we need and the query was just shortened
    // for display purposes, so re-searching it would reopen the dropdown.
    if (justSelected.current) {
      justSelected.current = false
      return
    }

    if (debouncedQuery.length < 2) {
      setResults([])
      setOpen(false)
      setFetching(false)
      return
    }

    let cancelled = false
    setFetching(true)

    fetch(
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(debouncedQuery)}&format=json&limit=${LIMITS.geocodeResults}&addressdetails=1`
    )
      .then((r) => r.json())
      .then((data: NominatimResult[]) => {
        if (cancelled) return
        if (justSelected.current) return   // user selected a result; don't reopen with stale data
        setResults(data)
        setOpen(true)
        setActiveIdx(-1)
      })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setFetching(false) })

    return () => { cancelled = true }
  }, [debouncedQuery])

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Fly to a result ──────────────────────────────────────────────────────
  const selectResult = useCallback((r: NominatimResult) => {
    const lat  = parseFloat(r.lat)
    const lng  = parseFloat(r.lon)
    const zoom = bboxZoom(r.boundingbox)
    onFlyTo(lat, lng, zoom)
    // Build a readable short name; for street addresses the first comma-
    // segment is just the house number, so extractPrimaryName combines it
    // with the street name (e.g. "139 Chrystie Street" not "139").
    const name = extractPrimaryName(r.display_name)
    justSelected.current = true
    setResults([])   // clear so onFocus can't reopen the dropdown
    setQuery(name)
    setOpen(false)
    // Offer to pin this location (if parent supports it)
    if (onAddPin) setPinCandidate({ lat, lng, name })
  }, [onFlyTo, onAddPin])

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0) selectResult(results[activeIdx])
      else if (results[0]) selectResult(results[0])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const clear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    setPinCandidate(null)
    inputRef.current?.focus()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      // Sits top-right of the map, above Leaflet's max z-index (~1000).
      // When the community panel is open: hidden on mobile (panel is full-width),
      // shifted left on sm+ so it clears the 320px panel + 16px gap.
      className={`absolute top-4 z-[1001] w-72 max-w-[calc(100vw-4.5rem)] transition-[right] duration-200 ${
        panelOpen
          ? 'right-4 hidden sm:block sm:right-[336px]'
          : 'right-4'
      }`}
    >
      {/* ── Input ── */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPinCandidate(null); setOpen(false) }}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Go to a place…"
          autoComplete="off"
          className="w-full rounded-xl border border-gray-700 bg-gray-900/90 py-2.5 pl-9 pr-9 text-sm text-white placeholder-gray-500 shadow-lg backdrop-blur-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {showSpinner ? (
          <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-gray-500" />
        ) : query ? (
          <button
            onClick={clear}
            className="absolute right-2.5 rounded p-0.5 text-gray-500 transition-colors hover:text-gray-300"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* ── Dropdown ── */}
      {open && results.length > 0 && (
        <ul className="mt-1.5 overflow-hidden rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm">
          {results.map((r, i) => {
            // Split on Nominatim's ", " separator to get clean parts
            const rawParts      = r.display_name.split(', ')
            const isHouseNum    = rawParts.length > 1 && /^\d+[A-Za-z]?$/.test(rawParts[0].trim())
            const primary       = isHouseNum
              ? `${rawParts[0].trim()} ${rawParts[1].trim()}`
              : rawParts[0].trim()
            // Skip the parts consumed by primary (1 for place names, 2 for house+street)
            const secondary     = rawParts.slice(isHouseNum ? 2 : 1).join(', ')
            return (
              <li key={r.place_id}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault() // keep input focused so onBlur doesn't fire first
                    selectResult(r)
                  }}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === activeIdx ? 'bg-indigo-600/30' : 'hover:bg-gray-800'
                  }`}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{primary}</p>
                    {secondary && (
                      <p className="truncate text-xs text-gray-500">{secondary}</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── "Add pin here" action pill — appears after a place is selected ── */}
      {pinCandidate && onAddPin && (
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-gray-900/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
          <span className="flex-1 truncate text-xs text-gray-300">{pinCandidate.name}</span>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              onAddPin(pinCandidate.lat, pinCandidate.lng, pinCandidate.name)
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-3 w-3" />
            Add pin
          </button>
        </div>
      )}
    </div>
  )
}

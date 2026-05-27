'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader2, MapPin } from 'lucide-react'

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

export default function LocationSearch({ onFlyTo }: LocationSearchProps) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<NominatimResult[]>([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)

  const inputRef     = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Debounced geocoding search ───────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(trimmed)}&format=json&limit=5&addressdetails=1`
        const res = await fetch(url)
        const data: NominatimResult[] = await res.json()
        setResults(data)
        setOpen(true)
        setActiveIdx(-1)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

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
  const selectResult = (r: NominatimResult) => {
    const lat  = parseFloat(r.lat)
    const lng  = parseFloat(r.lon)
    const zoom = bboxZoom(r.boundingbox)
    onFlyTo(lat, lng, zoom)
    // show only the primary place name in the input
    setQuery(r.display_name.split(',')[0].trim())
    setOpen(false)
    inputRef.current?.blur()
  }

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
    inputRef.current?.focus()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      // Sits top-right of the map, above Leaflet's max z-index (~1000)
      className="absolute right-4 top-4 z-[1001] w-72 max-w-[calc(100vw-4.5rem)]"
    >
      {/* ── Input ── */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Go to a place…"
          className="w-full rounded-xl border border-gray-700 bg-gray-900/90 py-2.5 pl-9 pr-9 text-sm text-white placeholder-gray-500 shadow-lg backdrop-blur-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {loading ? (
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
            const parts     = r.display_name.split(', ')
            const primary   = parts[0]
            const secondary = parts.slice(1).join(', ')
            return (
              <li key={r.place_id}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault() // keep focus in input so onBlur doesn't fire first
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
    </div>
  )
}

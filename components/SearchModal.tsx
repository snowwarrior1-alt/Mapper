'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, MapPin, Users, ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Community, Pin } from '@/lib/types'

interface SearchModalProps {
  communities: Community[]
  onSelectCommunity: (id: string) => void
  onSelectPin: (pin: Pin) => void
  onClose: () => void
}

export default function SearchModal({
  communities,
  onSelectCommunity,
  onSelectPin,
  onClose,
}: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [pinResults, setPinResults] = useState<Pin[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // Filter communities client-side (instant, no network needed)
  const communityResults = query.trim().length < 1
    ? []
    : communities.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.slug.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 4)

  // Debounced Supabase pin search
  useEffect(() => {
    if (query.trim().length < 2) { setPinResults([]); return }

    const timer = setTimeout(async () => {
      setLoading(true)
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('pins')
        .select('*, community:communities(id,name,color,icon,slug), profile:profiles(username,avatar_url)')
        .eq('status', 'approved')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(`title.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`)
        .order('vote_count', { ascending: false })
        .limit(5)

      setPinResults(data ?? [])
      setLoading(false)
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  const totalResults = communityResults.length + pinResults.length

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0) }, [query])

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSelect = useCallback(
    (index: number) => {
      if (index < communityResults.length) {
        onSelectCommunity(communityResults[index].id)
      } else {
        const pin = pinResults[index - communityResults.length]
        if (pin) onSelectPin(pin)
      }
      onClose()
    },
    [communityResults, pinResults, onSelectCommunity, onSelectPin, onClose]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, totalResults - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && totalResults > 0) {
      handleSelect(activeIndex)
    }
  }

  return (
    <div
      className="absolute inset-0 z-[2000] flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-4 w-full max-w-xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">

        {/* ── Search input ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-gray-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pins and communities…"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
          />
          {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-600" />}
          <button onClick={onClose} className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length < 1 ? (
            /* Empty state */
            <div className="px-4 py-10 text-center text-sm text-gray-600">
              Type to search pins and communities
            </div>
          ) : communityResults.length === 0 && pinResults.length === 0 && !loading ? (
            /* No results */
            <div className="px-4 py-10 text-center text-sm text-gray-600">
              No results for &ldquo;<span className="text-gray-400">{query}</span>&rdquo;
            </div>
          ) : (
            <>
              {/* Community results */}
              {communityResults.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    <Users className="h-3 w-3" /> Communities
                  </p>
                  {communityResults.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelect(i)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        activeIndex === i ? 'bg-gray-800' : 'hover:bg-gray-800/50'
                      }`}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                        style={{ backgroundColor: c.color + '22', border: `2px solid ${c.color}` }}
                      >
                        {c.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{c.name}</p>
                        <p className="text-xs text-gray-600">c/{c.slug}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                    </button>
                  ))}
                </div>
              )}

              {/* Pin results */}
              {pinResults.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    <MapPin className="h-3 w-3" /> Pins
                  </p>
                  {pinResults.map((pin, i) => {
                    const idx = communityResults.length + i
                    const comm = pin.community
                    return (
                      <button
                        key={pin.id}
                        onClick={() => handleSelect(idx)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          activeIndex === idx ? 'bg-gray-800' : 'hover:bg-gray-800/50'
                        }`}
                      >
                        {comm ? (
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                            style={{ backgroundColor: comm.color + '22', border: `2px solid ${comm.color}` }}
                          >
                            {comm.icon}
                          </span>
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-base">
                            📍
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{pin.title}</p>
                          <p className="truncate text-xs text-gray-600">
                            {comm?.name ?? 'Unknown'} · {pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-bold tabular-nums ${
                            pin.vote_count > 0 ? 'text-green-400' : pin.vote_count < 0 ? 'text-red-400' : 'text-gray-600'
                          }`}
                        >
                          {pin.vote_count > 0 ? `+${pin.vote_count}` : pin.vote_count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Loading skeleton */}
              {loading && pinResults.length === 0 && (
                <div className="space-y-1 px-4 py-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex animate-pulse items-center gap-3 py-1.5">
                      <div className="h-8 w-8 rounded-lg bg-gray-800" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 rounded bg-gray-800" />
                        <div className="h-2.5 w-1/3 rounded bg-gray-800" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Keyboard hints ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 border-t border-gray-800 px-4 py-2.5 text-xs text-gray-700">
          <span>
            <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-500">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-500">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-500">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}

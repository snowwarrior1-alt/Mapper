'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Route as RouteIcon, ArrowLeft, Trash2, Plus, Check, X,
  ChevronUp, ChevronDown, MapPinned, Search, ListOrdered, Map as MapIcon, Globe,
} from 'lucide-react'
import { Pin, Route, Community, TravelMode } from '@/lib/types'
import { COMMUNITY_COLORS } from '@/lib/constants'
import { TRAVEL_MODES } from '@/lib/routing'

type Tab = 'stops' | 'community' | 'map'

interface RouteBuilderProps {
  route: Route
  steps: { step: number; pins: Pin[] }[]        // ordered steps; >1 pin = alternatives
  communities: Community[]
  pins: Pin[]                                   // all in-memory approved pins
  canEdit: boolean                              // false = read-only public viewer
  authorName?: string                           // shown in the read-only viewer
  targetStep: number | null                     // when adding an alternative to a step
  onSetTargetStep: (step: number | null) => void
  onSelectBuilderCommunity: (id: string | null) => void  // drives which pins the map shows
  onAddPin: (pin: Pin) => void
  onRemoveStop: (pinId: string) => void
  onMoveStep: (step: number, dir: -1 | 1) => void
  onFlyToPin: (pin: Pin) => void
  onRename: (id: string, name: string) => void
  onUpdateColor: (id: string, color: string) => void
  onUpdateMode: (id: string, mode: TravelMode) => void
  onPublish: (id: string, communityId: string | null) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function RouteBuilder({
  route, steps, communities, pins, canEdit, authorName, targetStep, onSetTargetStep,
  onSelectBuilderCommunity, onAddPin, onRemoveStop, onMoveStep, onFlyToPin,
  onRename, onUpdateColor, onUpdateMode, onPublish, onDelete, onClose,
}: RouteBuilderProps) {
  const totalStops = steps.reduce((n, g) => n + g.pins.length, 0)
  const [tab, setTab] = useState<Tab>(!canEdit || totalStops > 0 ? 'stops' : 'community')
  const defaultCommunityId = steps[0]?.pins[0]?.community_id ?? communities[0]?.id ?? null
  const [pickedCommunityId, setPickedCommunityId] = useState<string | null>(defaultCommunityId)
  const [search, setSearch] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(route.name)
  const [colorOpen, setColorOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const activeMode = TRAVEL_MODES.find((m) => m.id === route.travel_mode) ?? TRAVEL_MODES[0]

  // Keep the map's shown pins in sync with the active tab (so map taps add the
  // pins you're looking at). "From community" → that community; otherwise all.
  useEffect(() => {
    onSelectBuilderCommunity(canEdit && tab === 'community' ? pickedCommunityId : null)
  }, [canEdit, tab, pickedCommunityId, onSelectBuilderCommunity])

  useEffect(() => { setNameDraft(route.name) }, [route.id, route.name])

  const addedIds = useMemo(() => new Set(steps.flatMap((g) => g.pins.map((p) => p.id))), [steps])

  // Switch to the "From community" tab to add an alternative to a specific step.
  const startAddAlternative = (step: number) => { onSetTargetStep(step); setTab('community') }
  const finishAdding = () => { onSetTargetStep(null); setTab('stops') }

  const communityPins = useMemo(() => {
    if (!pickedCommunityId) return []
    const q = search.trim().toLowerCase()
    return pins
      .filter((p) => p.community_id === pickedCommunityId)
      .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
  }, [pins, pickedCommunityId, search])

  const commitName = () => {
    const n = nameDraft.trim()
    setEditingName(false)
    if (n && n !== route.name) onRename(route.id, n)
    else setNameDraft(route.name)
  }

  // ── Tab switcher ──────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'stops', label: 'Stops', icon: <ListOrdered className="h-3.5 w-3.5" /> },
    { id: 'community', label: 'From community', icon: <Plus className="h-3.5 w-3.5" /> },
    { id: 'map', label: 'From map', icon: <MapIcon className="h-3.5 w-3.5" /> },
  ]
  // Read-only viewer: only the Stops list, no add tabs.
  const renderTabs = () => !canEdit ? null : (
    <div className="flex shrink-0 gap-1 border-b border-gray-800 p-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          {t.icon}
          <span className="truncate">{t.label}</span>
        </button>
      ))}
    </div>
  )

  // ── Steps list (a step with >1 pin = alternatives) ──────────────────────────
  const renderStops = () =>
    steps.length === 0 ? (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <MapPinned className="h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">No stops yet</p>
        <p className="text-xs leading-relaxed text-gray-600">
          Use <span className="font-semibold text-gray-400">From community</span> to add existing
          pins, or <span className="font-semibold text-gray-400">From map</span> to tap them.
        </p>
      </div>
    ) : (
      <ul className="divide-y divide-gray-800/60">
        {steps.map((g, i) => (
          <li key={g.step} className="px-3 py-2.5">
            <div className="flex gap-2">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: route.color }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {g.pins.map((pin, k) => (
                  <div key={pin.id}>
                    {k > 0 && <p className="my-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">or</p>}
                    <div className="flex items-center gap-2">
                      <button onClick={() => onFlyToPin(pin)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-white">{pin.title}</p>
                        {pin.community && (
                          <p className="truncate text-xs text-gray-500">{pin.community.icon} {pin.community.name}</p>
                        )}
                      </button>
                      {canEdit && (
                        <button onClick={() => onRemoveStop(pin.id)} title="Remove"
                          className="shrink-0 rounded p-1 text-gray-600 transition-colors hover:text-red-400">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {canEdit && (
                  <button onClick={() => startAddAlternative(g.step)}
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300">
                    <Plus className="h-3 w-3" /> Add alternative
                  </button>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 flex-col items-center">
                  <button onClick={() => onMoveStep(g.step, -1)} disabled={i === 0} title="Move step up"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => onMoveStep(g.step, 1)} disabled={i === steps.length - 1} title="Move step down"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    )

  // Banner shown while adding alternatives to a specific step.
  const targetStepNumber = targetStep == null ? null : steps.findIndex((g) => g.step === targetStep) + 1
  const addingBanner = targetStep != null && (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600/10 px-3 py-2 text-xs text-indigo-200">
      <span>Adding an <span className="font-semibold">alternative</span> to step {targetStepNumber}</span>
      <button onClick={finishAdding} className="shrink-0 rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-500">
        Done
      </button>
    </div>
  )

  // ── Community pin picker ──────────────────────────────────────────────────
  const renderCommunityPicker = () => (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 p-3">
        {addingBanner}
        <select
          value={pickedCommunityId ?? ''}
          onChange={(e) => setPickedCommunityId(e.target.value || null)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {communities.length === 0 && <option value="">No communities</option>}
          {communities.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pins in this community…"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <p className="text-xs text-gray-600">Tap a pin to add it — or tap it on the map.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {communityPins.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-600">
            {pickedCommunityId ? 'No matching pins in this community yet.' : 'Pick a community above.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {communityPins.map((p) => {
              const added = addedIds.has(p.id)
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                  <button onClick={() => onFlyToPin(p)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-white">{p.title}</p>
                    {p.description && <p className="truncate text-xs text-gray-500">{p.description}</p>}
                  </button>
                  <button
                    onClick={() => onAddPin(p)}
                    disabled={added}
                    className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      added
                        ? 'cursor-default bg-green-600/15 text-green-400'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500'
                    }`}
                  >
                    {added ? <><Check className="h-3.5 w-3.5" /> Added</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )

  // ── From-map hint ─────────────────────────────────────────────────────────
  const renderMapHint = () => (
    <div className="flex h-full flex-col">
      {addingBanner && <div className="p-3">{addingBanner}</div>}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <MapPinned className="h-8 w-8 text-gray-700" />
        <p className="text-sm font-medium text-gray-400">Tap pins on the map</p>
        <p className="text-xs leading-relaxed text-gray-600">
          {targetStep != null ? (
            <>Each pin you tap becomes an <span className="font-semibold text-gray-400">alternative</span> for step {targetStepNumber}.</>
          ) : (
            <>Each pin you tap is added to <span className="font-semibold text-gray-400">{route.name}</span> as a new step. Switch to <span className="font-semibold text-gray-400">Stops</span> to reorder.</>
          )}
        </p>
      </div>
    </div>
  )

  const renderActivePane = () =>
    !canEdit || tab === 'stops' ? renderStops() : tab === 'community' ? renderCommunityPicker() : renderMapHint()

  const publishedCommunity = communities.find((c) => c.id === route.community_id) ?? null

  // ── Top bar (shared) ──────────────────────────────────────────────────────
  const topBar = (
    <div
      className="pointer-events-auto relative flex shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/95 px-3 py-2.5 backdrop-blur-sm"
      style={{ boxShadow: `inset 0 -2px 0 ${route.color}` }}
    >
      <button onClick={onClose} title="Back to map"
        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => canEdit && setColorOpen((v) => !v)}
        title={canEdit ? 'Route color' : undefined}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${canEdit ? '' : 'cursor-default'}`}
        style={{ backgroundColor: route.color + '22', border: `2px solid ${route.color}` }}
      >
        <RouteIcon className="h-4 w-4" style={{ color: route.color }} />
      </button>
      <div className="min-w-0 flex-1">
        {canEdit && editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameDraft(route.name); setEditingName(false) } }}
            maxLength={60}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm font-bold text-white focus:border-indigo-500 focus:outline-none"
          />
        ) : canEdit ? (
          <button onClick={() => setEditingName(true)} className="block max-w-full truncate text-left text-sm font-bold text-white hover:text-indigo-300">
            {route.name}
          </button>
        ) : (
          <h2 className="truncate text-sm font-bold text-white">{route.name}</h2>
        )}
        <p className="truncate text-xs text-gray-500">
          {activeMode.emoji} {activeMode.label} · {totalStops} {totalStops === 1 ? 'stop' : 'stops'}
          {!canEdit && authorName && <> · by {authorName}</>}
          {!canEdit && publishedCommunity && <> · {publishedCommunity.icon} {publishedCommunity.name}</>}
        </p>
      </div>

      {canEdit && (
        <button onClick={() => setModeOpen((v) => !v)} title={`Travel mode: ${activeMode.label}`}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-gray-300 transition-colors hover:bg-gray-800">
          <span className="text-base leading-none">{activeMode.emoji}</span>
        </button>
      )}
      {canEdit && (
        <button onClick={() => setPublishOpen((v) => !v)} title={route.is_public ? 'Published — edit' : 'Publish to a community'}
          className={`rounded-lg p-1.5 transition-colors ${route.is_public ? 'text-green-400 hover:bg-green-600/10' : 'text-gray-500 hover:bg-gray-800 hover:text-white'}`}>
          <Globe className="h-4 w-4" />
        </button>
      )}
      {canEdit && (
        <button onClick={() => onDelete(route.id)} title="Delete route"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-600/10 hover:text-red-400">
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {canEdit && modeOpen && (
        <div className="absolute right-2 top-full z-10 mt-1 w-44 rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-2xl">
          <p className="px-2 py-1 text-xs font-semibold text-gray-500">Follow…</p>
          {TRAVEL_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => { onUpdateMode(route.id, m.id); setModeOpen(false) }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                route.travel_mode === m.id ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className="text-base leading-none">{m.emoji}</span> {m.label}
              {route.travel_mode === m.id && <Check className="ml-auto h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}

      {canEdit && colorOpen && (
        <div className="absolute left-12 top-full z-10 mt-1 grid grid-cols-6 gap-1.5 rounded-xl border border-gray-700 bg-gray-900 p-2 shadow-2xl">
          {COMMUNITY_COLORS.map((hex) => (
            <button
              key={hex}
              onClick={() => { onUpdateColor(route.id, hex); setColorOpen(false) }}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${route.color === hex ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: hex }}
            >
              {route.color === hex && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          ))}
        </div>
      )}

      {canEdit && publishOpen && (
        <div className="absolute right-2 top-full z-10 mt-1 w-72 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-2xl">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Globe className="h-4 w-4 text-green-400" /> Publish route
          </p>
          <p className="mb-3 text-xs text-gray-500">
            Share this route on a community page. Anyone can view it; only you can edit it.
          </p>
          <label className="mb-1 block text-xs text-gray-400">Community</label>
          <select
            value={route.community_id ?? ''}
            onChange={(e) => onPublish(route.id, e.target.value || null)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Private (not published)</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-600">
            {route.is_public ? '✓ Public' : 'Currently private'}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div className="pointer-events-none absolute inset-0 z-[1200] flex flex-col">
      {topBar}

      {/* Body — desktop control column on the left, map shows through on the right */}
      <div className="flex min-h-0 flex-1">
        <div className="pointer-events-auto hidden w-96 flex-col border-r border-gray-800 bg-gray-900/95 backdrop-blur-sm md:flex">
          {renderTabs()}
          <div className="min-h-0 flex-1 overflow-y-auto">{renderActivePane()}</div>
        </div>
        <div className="flex-1" /> {/* transparent — the live map preview behind */}
      </div>

      {/* Mobile bottom sheet */}
      <div className="pointer-events-auto flex max-h-[55dvh] flex-col rounded-t-2xl border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm md:hidden">
        {renderTabs()}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          {renderActivePane()}
        </div>
      </div>
    </div>
  )
}

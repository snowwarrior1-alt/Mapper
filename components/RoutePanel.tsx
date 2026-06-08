'use client'

import { Route as RouteIcon, X, Plus, Check, Trash2, ChevronUp, ChevronDown, MapPinned } from 'lucide-react'
import { Pin, Route } from '@/lib/types'

interface RoutePanelProps {
  route: Route
  stops: { pin: Pin; position: number }[]
  buildMode: boolean
  onToggleBuild: () => void
  onClose: () => void
  onSelectPin: (pin: Pin) => void
  onRemoveStop: (pinId: string) => void
  onMoveStop: (index: number, dir: -1 | 1) => void
  onDelete: (id: string) => void
}

export default function RoutePanel({
  route,
  stops,
  buildMode,
  onToggleBuild,
  onClose,
  onSelectPin,
  onRemoveStop,
  onMoveStop,
  onDelete,
}: RoutePanelProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1150] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-gray-800 bg-gray-900/95 shadow-2xl backdrop-blur-sm sm:bottom-auto sm:left-auto sm:top-0 sm:h-full sm:max-h-none sm:w-80 sm:rounded-none sm:border-b-0 sm:border-l sm:border-r-0 sm:border-t-0">
      {/* Drag handle — mobile only */}
      <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
        <div className="h-1 w-10 rounded-full bg-gray-700" />
      </div>

      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-3"
        style={{ backgroundColor: route.color + '18' }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: route.color + '22', border: `2px solid ${route.color}` }}
        >
          <RouteIcon className="h-4 w-4" style={{ color: route.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-white">{route.name}</h2>
          <p className="text-xs text-gray-500">{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</p>
        </div>
        <button
          onClick={() => onDelete(route.id)}
          title="Delete route"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-600/10 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Build toggle */}
      <div className="shrink-0 border-b border-gray-800 px-4 py-2.5">
        <button
          onClick={onToggleBuild}
          className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            buildMode
              ? 'bg-green-600 text-white hover:bg-green-500'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {buildMode ? <><Check className="h-4 w-4" /> Done adding</> : <><Plus className="h-4 w-4" /> Add stops</>}
        </button>
        {buildMode && (
          <p className="mt-2 text-center text-xs text-gray-500">
            Tap pins on the map to add them in order.
          </p>
        )}
      </div>

      {/* Stops */}
      <div className="flex-1 overflow-y-auto">
        {stops.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MapPinned className="h-8 w-8 text-gray-700" />
            <p className="text-sm font-medium text-gray-400">No stops yet</p>
            <p className="text-xs leading-relaxed text-gray-600">
              Tap <span className="font-semibold text-gray-400">Add stops</span>, then tap pins on the
              map to chain them into a route.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {stops.map((s, i) => (
              <li key={s.pin.id} className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: route.color }}
                >
                  {i + 1}
                </span>
                <button
                  onClick={() => onSelectPin(s.pin)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-white">{s.pin.title}</p>
                  {s.pin.community && (
                    <p className="truncate text-xs text-gray-500">
                      {s.pin.community.icon} {s.pin.community.name}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={() => onMoveStop(i, -1)}
                    disabled={i === 0}
                    title="Move up"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onMoveStop(i, 1)}
                    disabled={i === stops.length - 1}
                    title="Move down"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onRemoveStop(s.pin.id)}
                    title="Remove stop"
                    className="rounded p-1 text-gray-600 transition-colors hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

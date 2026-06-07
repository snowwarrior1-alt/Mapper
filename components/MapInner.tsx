'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, ZoomControl, Polyline, useMapEvents, useMap } from 'react-leaflet'
import { Community, Pin } from '@/lib/types'
import PinClusterLayer from './PinClusterLayer'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlyToTarget {
  lat: number
  lng: number
  zoom: number
  /** Monotonically-increasing counter so the effect fires even for identical coords */
  id: number
}

export type MapStyle = 'light' | 'dark' | 'satellite'

/** Tile presets — all free / no API key. */
export const TILE_PRESETS: Record<MapStyle, { url: string; attribution: string; subdomains?: string; maxZoom: number }> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Invisible component — listens to map click events */
function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/** Flies the Leaflet map whenever `target` changes (keyed by target.id). */
function FlyToController({ target }: { target: FlyToTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], target.zoom, { duration: 1.5 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]) // new object reference = new fly request
  return null
}

/** Fits the map to a route's bounds whenever the route path changes. */
function RouteBoundsController({ path }: { path: [number, number][] | undefined }) {
  const map = useMap()
  const sig = path ? path.map((p) => p.join(',')).join('|') : ''
  useEffect(() => {
    if (path && path.length >= 2) {
      map.fitBounds(path, { padding: [60, 60], maxZoom: 16 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return null
}

/** Reports the map center whenever the user finishes panning/zooming. */
function MapCenterTracker({ onCenterChange }: { onCenterChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend(e) {
      const { lat, lng } = e.target.getCenter()
      onCenterChange(lat, lng)
    },
  })
  return null
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MapInnerProps {
  pins: Pin[]
  communities: Community[]
  onMapClick: (lat: number, lng: number) => void
  onPinClick: (pin: Pin) => void
  flyToTarget: FlyToTarget | null
  onCenterChange?: (lat: number, lng: number) => void
  followedUserIds?: Set<string>
  mapStyle?: MapStyle
  /** Ordered [lat,lng] points of the active route, drawn as a polyline */
  routePath?: [number, number][]
  routeColor?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapInner({
  pins,
  communities,
  onMapClick,
  onPinClick,
  flyToTarget,
  onCenterChange,
  followedUserIds,
  mapStyle = 'light',
  routePath,
  routeColor = '#6366f1',
}: MapInnerProps) {
  const tiles = TILE_PRESETS[mapStyle] ?? TILE_PRESETS.light
  const communityById = useMemo(
    () => Object.fromEntries(communities.map((c) => [c.id, c])),
    [communities]
  )

  return (
    <MapContainer
      center={[30, 10]}
      zoom={2}
      minZoom={2}
      className="h-full w-full"
      zoomControl={false}
    >
      {/* Tiles — switchable (light / dark / satellite). key forces a swap on change. */}
      <TileLayer
        key={mapStyle}
        url={tiles.url}
        attribution={tiles.attribution}
        subdomains={tiles.subdomains ?? 'abc'}
        maxZoom={tiles.maxZoom}
      />

      <ZoomControl position="bottomright" />
      <ClickHandler onClick={onMapClick} />
      <FlyToController target={flyToTarget} />
      {onCenterChange && <MapCenterTracker onCenterChange={onCenterChange} />}

      {/* Active route polyline + auto-fit */}
      {routePath && routePath.length >= 2 && (
        <>
          <Polyline positions={routePath} pathOptions={{ color: routeColor, weight: 4, opacity: 0.85, dashArray: '1 8', lineCap: 'round' }} />
          <Polyline positions={routePath} pathOptions={{ color: routeColor, weight: 4, opacity: 0.5 }} />
          <RouteBoundsController path={routePath} />
        </>
      )}

      {/* Cluster layer — manages its own Leaflet layer imperatively */}
      <PinClusterLayer
        pins={pins}
        communityById={communityById}
        onPinClick={onPinClick}
        followedUserIds={followedUserIds}
      />
    </MapContainer>
  )
}

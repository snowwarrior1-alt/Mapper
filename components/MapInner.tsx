'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMapEvents, useMap } from 'react-leaflet'
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface MapInnerProps {
  pins: Pin[]
  communities: Community[]
  onMapClick: (lat: number, lng: number) => void
  onPinClick: (pin: Pin) => void
  flyToTarget: FlyToTarget | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapInner({
  pins,
  communities,
  onMapClick,
  onPinClick,
  flyToTarget,
}: MapInnerProps) {
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
      {/* CartoDB Positron — clean, light, free */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      <ZoomControl position="bottomright" />
      <ClickHandler onClick={onMapClick} />
      <FlyToController target={flyToTarget} />

      {/* Cluster layer — manages its own Leaflet layer imperatively */}
      <PinClusterLayer
        pins={pins}
        communityById={communityById}
        onPinClick={onPinClick}
      />
    </MapContainer>
  )
}

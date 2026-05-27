'use client'

import 'leaflet/dist/leaflet.css'
import { useMemo } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet'
import { Community, Pin } from '@/lib/types'
import PinClusterLayer from './PinClusterLayer'

// Invisible click handler mounted inside the MapContainer
function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

interface MapInnerProps {
  pins: Pin[]
  communities: Community[]
  onMapClick: (lat: number, lng: number) => void
  onPinClick: (pin: Pin) => void
}

export default function MapInner({ pins, communities, onMapClick, onPinClick }: MapInnerProps) {
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

      {/* Cluster layer — manages its own Leaflet layer imperatively */}
      <PinClusterLayer
        pins={pins}
        communityById={communityById}
        onPinClick={onPinClick}
      />
    </MapContainer>
  )
}

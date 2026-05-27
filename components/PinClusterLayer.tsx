'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Community, Pin } from '@/lib/types'

// ── Icon builders ─────────────────────────────────────────────────────────────

/** Teardrop pin icon coloured by community */
function buildPinIcon(community: Community): L.DivIcon {
  const size = 36
  const half = size / 2
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;height:${size}px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${community.color};border:3px solid #fff;
        box-shadow:0 3px 10px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="transform:rotate(45deg);font-size:${Math.round(size * 0.44)}px;line-height:1;display:block">
          ${community.icon}
        </span>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [half, size],
    popupAnchor: [0, -size - 4],
  })
}

/** Cluster bubble — grows at 10+ and 100+ */
function buildClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 36 : count < 100 ? 42 : 50
  const fontSize = count < 10 ? 13 : count < 100 ? 14 : 16
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:#1f2937;border:2.5px solid #4f46e5;
        color:#fff;display:flex;align-items:center;justify-content:center;
        font-size:${fontSize}px;font-weight:700;font-family:system-ui,sans-serif;
        box-shadow:0 3px 12px rgba(0,0,0,.45);
      ">
        ${count}
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PinClusterLayerProps {
  pins: Pin[]
  communityById: Record<string, Community>
  onPinClick: (pin: Pin) => void
}

export default function PinClusterLayer({ pins, communityById, onPinClick }: PinClusterLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)

  // Keep the click handler ref fresh so we never need to rebuild
  // markers just because the parent re-created the callback.
  const onClickRef = useRef(onPinClick)
  useEffect(() => { onClickRef.current = onPinClick }, [onPinClick])

  // Create the cluster group once and attach it to the map
  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      animate: true,
      iconCreateFunction: (cluster) => buildClusterIcon(cluster.getChildCount()),
    })
    groupRef.current = group
    map.addLayer(group)

    return () => {
      map.removeLayer(group)
      groupRef.current = null
    }
  }, [map])

  // Sync markers whenever pins or communities change
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    group.clearLayers()

    // Build all markers first, then batch-add them (much faster than one-by-one)
    const markers: L.Marker[] = []
    for (const pin of pins) {
      const community = communityById[pin.community_id]
      if (!community) continue
      const marker = L.marker([pin.lat, pin.lng], { icon: buildPinIcon(community) })
      marker.on('click', () => onClickRef.current(pin))
      markers.push(marker)
    }
    group.addLayers(markers)
  }, [pins, communityById])

  return null
}

'use client'

import dynamic from 'next/dynamic'
import { Community, Pin } from '@/lib/types'
import type { FlyToTarget } from './MapInner'

// Must be inside a 'use client' module for ssr:false to work (Next.js 16 docs)
const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-800">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-indigo-500" />
        <span className="text-sm text-gray-400">Loading map…</span>
      </div>
    </div>
  ),
})

interface MapWrapperProps {
  pins: Pin[]
  communities: Community[]
  onMapClick: (lat: number, lng: number) => void
  onPinClick: (pin: Pin) => void
  flyToTarget: FlyToTarget | null
}

export default function MapWrapper(props: MapWrapperProps) {
  return <MapInner {...props} />
}

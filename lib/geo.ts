/**
 * Geocoding helpers — thin wrappers around free OpenStreetMap services.
 *   - Nominatim  (reverse geocoding: coords → address)
 *   - Overpass   (nearby named POIs: coords → places)
 *
 * Privacy note: these send the given coordinates to third-party OSM servers.
 * Only call them with coordinates the user has chosen to act on.
 */

export interface NominatimReverse {
  address?: Record<string, string>
  display_name?: string
}

/** Reverse-geocode a point to a raw Nominatim result (null on failure). */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<NominatimReverse | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' }, signal }
    )
    return (await r.json()) as NominatimReverse
  } catch {
    return null
  }
}

/** Build a short human-readable address from a reverse-geocode result. */
export function formatAddress(data: NominatimReverse | null, maxParts = 3): string | null {
  if (!data) return null
  const a = data.address
  if (!a) return data.display_name?.split(', ').slice(0, maxParts).join(', ') ?? null
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway ?? a.path].filter(Boolean).join(' ')
  const neighbourhood = a.suburb ?? a.quarter ?? a.neighbourhood ?? a.city_district
  const city = a.city ?? a.town ?? a.village ?? a.municipality
  const region = a.state ?? a.county
  const parts = [street, neighbourhood, city, region].filter(Boolean)
  return (
    parts.slice(0, maxParts).join(', ') ||
    data.display_name?.split(', ').slice(0, maxParts).join(', ') ||
    null
  )
}

// ── Nearby places (Overpass) ──────────────────────────────────────────────────

export interface NearbyPlace {
  key: string
  name: string
  category: string
  lat: number
  lng: number
  dist: number // metres from the query point
}

interface OverpassEl {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Rough metres between two lat/lng points (haversine). */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Named POIs within `radius` metres of a point, nearest first (empty on failure). */
export async function nearbyPlaces(
  lat: number,
  lng: number,
  radius = 70,
  limit = 8
): Promise<NearbyPlace[]> {
  const q =
    `[out:json][timeout:8];(` +
    `nwr(around:${radius},${lat},${lng})[name][amenity];` +
    `nwr(around:${radius},${lat},${lng})[name][shop];` +
    `nwr(around:${radius},${lat},${lng})[name][leisure];` +
    `nwr(around:${radius},${lat},${lng})[name][tourism];` +
    `);out center tags 25;`
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)
    const d = (await r.json()) as { elements?: OverpassEl[] }
    const seen = new Set<string>()
    const list: NearbyPlace[] = []
    for (const el of d.elements ?? []) {
      const name = el.tags?.name
      const pLat = el.lat ?? el.center?.lat
      const pLng = el.lon ?? el.center?.lon
      if (!name || pLat == null || pLng == null) continue
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      const category = el.tags?.amenity ?? el.tags?.shop ?? el.tags?.leisure ?? el.tags?.tourism ?? 'place'
      list.push({
        key: `${el.type}/${el.id}`,
        name,
        category: category.replace(/_/g, ' '),
        lat: pLat,
        lng: pLng,
        dist: distanceMeters(lat, lng, pLat, pLng),
      })
    }
    list.sort((x, y) => x.dist - y.dist)
    return list.slice(0, limit)
  } catch {
    return []
  }
}

/** Format a metre distance for display, e.g. "120 m" / "1.4 km". */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

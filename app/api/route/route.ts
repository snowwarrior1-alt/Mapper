/**
 * POST /api/route
 *
 * Proxies an ordered list of stops to OpenRouteService Directions and returns a
 * road/trail-snapped polyline. The ORS API key lives server-side only
 * (ORS_API_KEY) so it never reaches the browser. Requires a valid Supabase JWT
 * (Bearer) — only signed-in route owners recompute geometry, so this isn't an
 * open proxy that could drain the ORS quota.
 *
 * Body:  { coordinates: [[lat, lng], …], profile: TravelMode }   (>= 2 stops)
 * Reply: { geometry: [[lat, lng], …] }   on success
 *        { error }                        otherwise (caller falls back to lines)
 *
 * Set ORS_API_KEY (free at openrouteservice.org) in env. Without it this returns
 * 503 and the client keeps drawing straight lines.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

const PROFILES = new Set(['foot-walking', 'foot-hiking', 'cycling-regular', 'driving-car'])
const ORS_KEY = process.env.ORS_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST(req: NextRequest) {
  // Require a signed-in caller first — only route owners recompute geometry; gating
  // this keeps the endpoint (and our ORS quota) from being an open proxy, and
  // doesn't leak config status to anonymous callers.
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ') || !SUPABASE_URL || !ANON_KEY) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await caller.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  if (!ORS_KEY) return json({ error: 'Routing not configured' }, 503)

  let body: { coordinates?: unknown; profile?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON' }, 400) }

  const { coordinates, profile } = body
  if (typeof profile !== 'string' || !PROFILES.has(profile)) {
    return json({ error: 'Invalid profile' }, 400)
  }
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 50) {
    return json({ error: 'Need 2–50 coordinates' }, 400)
  }
  // Validate + flip to ORS order ([lng, lat]).
  const orsCoords: [number, number][] = []
  for (const c of coordinates) {
    if (!Array.isArray(c) || c.length !== 2) return json({ error: 'Bad coordinate' }, 400)
    const [lat, lng] = c
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'Bad coordinate' }, 400)
    orsCoords.push([lng, lat])
  }

  try {
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: orsCoords }),
    })
    if (!res.ok) {
      // ORS rejects e.g. points too far apart / not routable — let caller fall back.
      return json({ error: `Routing failed (${res.status})` }, 502)
    }
    const data = await res.json()
    const line = data?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(line)) return json({ error: 'No route found' }, 502)
    // Back to [lat, lng].
    const geometry = line.map((p: [number, number]) => [p[1], p[0]])
    return json({ geometry })
  } catch {
    return json({ error: 'Routing request failed' }, 502)
  }
}

import type { Pin } from '@/lib/types'

// Splits a route's ordered steps into the line segments the map draws.
//
// A route is a sequence of STEPS. The first pin of each step is the "spine"
// (the canonical stop the solid route runs through); extra pins in a step are
// "alternatives" — equally-reachable stops drawn as light dashed spurs off the
// PREVIOUS step's spine ("…then go to one of these").
//
// A step can also be flagged `equalOptions`: then the original/spine stop is
// treated as just another option, so the incoming main leg is dashed too — the
// previous stop fans out to ALL of this step's stops as equal dashed branches,
// with no solid line into the step.

export type LatLng = [number, number]

export interface RouteLegStep {
  /** the spine (first) pin's coordinate — the solid path runs through these */
  spine: LatLng
  /** the alternative pins' coordinates (everything after the spine) */
  alternatives: LatLng[]
  /** when true the incoming main leg (prev spine → this spine) is dashed, not solid */
  equalOptions: boolean
}

export interface RouteLegs {
  /** runs of consecutive spine coords; each run is snapped + drawn as ONE solid polyline */
  solidRuns: LatLng[][]
  /** individual from→to legs, each snapped + drawn as a dashed spur */
  dashedLegs: { from: LatLng; to: LatLng }[]
}

/** Build a `RouteLegStep[]` from grouped steps (spine = first pin of each). */
export function stepsToLegSteps(
  steps: { pins: Pin[]; equalOptions?: boolean }[],
): RouteLegStep[] {
  return steps.map((g) => ({
    spine: [g.pins[0].lat, g.pins[0].lng],
    alternatives: g.pins.slice(1).map((p) => [p.lat, p.lng] as LatLng),
    equalOptions: !!g.equalOptions,
  }))
}

/**
 * Partition the steps into solid runs (the main path) and dashed legs
 * (alternative spurs + the main legs of `equalOptions` steps). Each entry is a
 * geometry job for the snapping layer; failures fall back to the straight line.
 */
export function buildRouteLegs(steps: RouteLegStep[]): RouteLegs {
  const solidRuns: LatLng[][] = []
  const dashedLegs: { from: LatLng; to: LatLng }[] = []
  if (steps.length === 0) return { solidRuns, dashedLegs }

  // Walk the spine. A non-equal step extends the current solid run; an equal
  // step breaks the run (its incoming leg becomes a dashed branch instead).
  let run: LatLng[] = [steps[0].spine]
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].spine
    const cur = steps[i].spine
    if (steps[i].equalOptions) {
      if (run.length >= 2) solidRuns.push(run)
      dashedLegs.push({ from: prev, to: cur })
      run = [cur]
    } else {
      run.push(cur)
    }
  }
  if (run.length >= 2) solidRuns.push(run)

  // Alternatives always fan out from the previous step's spine.
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1].spine
    for (const alt of steps[i].alternatives) dashedLegs.push({ from, to: alt })
  }

  return { solidRuns, dashedLegs }
}

/**
 * Normalise a stored `routes.geometry` value into solid segments. Legacy rows
 * stored a single flat `[lat,lng][]` polyline; the current format is an array of
 * segments `[lat,lng][][]`. Returns null when there's nothing usable.
 */
export function normalizeSolidSegments(
  g: LatLng[] | LatLng[][] | null | undefined,
): LatLng[][] | null {
  if (!g || g.length === 0) return null
  // Flat polyline (legacy): first element is a [lat,lng] pair of numbers.
  if (typeof (g as number[][])[0][0] === 'number') return [g as LatLng[]]
  return g as LatLng[][]
}

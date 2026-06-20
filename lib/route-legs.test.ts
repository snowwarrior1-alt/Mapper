import { describe, it, expect } from 'vitest'
import {
  buildRouteLegs,
  normalizeSolidSegments,
  type RouteLegStep,
  type LatLng,
} from './route-legs'

const step = (
  spine: LatLng,
  alternatives: LatLng[] = [],
  equalOptions = false,
): RouteLegStep => ({ spine, alternatives, equalOptions })

describe('buildRouteLegs', () => {
  it('returns nothing for an empty route', () => {
    expect(buildRouteLegs([])).toEqual({ solidRuns: [], dashedLegs: [] })
  })

  it('draws a single solid run through a linear route, no dashed legs', () => {
    const a: LatLng = [0, 0], b: LatLng = [1, 1], c: LatLng = [2, 2]
    const { solidRuns, dashedLegs } = buildRouteLegs([step(a), step(b), step(c)])
    expect(solidRuns).toEqual([[a, b, c]])
    expect(dashedLegs).toEqual([])
  })

  it('drops a lone spine (one stop) — no solid run', () => {
    expect(buildRouteLegs([step([0, 0])])).toEqual({ solidRuns: [], dashedLegs: [] })
  })

  it('fans alternatives out from the PREVIOUS step spine as dashed legs', () => {
    const a: LatLng = [0, 0], b: LatLng = [1, 1], alt1: LatLng = [1, 2], alt2: LatLng = [1, 3]
    const { solidRuns, dashedLegs } = buildRouteLegs([step(a), step(b, [alt1, alt2])])
    // spine still solid a→b
    expect(solidRuns).toEqual([[a, b]])
    // both alternatives branch from the previous spine (a)
    expect(dashedLegs).toEqual([
      { from: a, to: alt1 },
      { from: a, to: alt2 },
    ])
  })

  it('ignores alternatives on the very first step (no previous spine to branch from)', () => {
    const a: LatLng = [0, 0], altA: LatLng = [0, 1], b: LatLng = [1, 1]
    const { solidRuns, dashedLegs } = buildRouteLegs([step(a, [altA]), step(b)])
    expect(solidRuns).toEqual([[a, b]])
    expect(dashedLegs).toEqual([]) // altA dropped — step 0 has no incoming leg
  })

  it('equalOptions breaks the solid run and dashes the main leg too', () => {
    const a: LatLng = [0, 0], b: LatLng = [1, 1], alt: LatLng = [1, 2]
    // step b is equal: previous (a) fans to BOTH b and alt as dashed; no solid into b
    const { solidRuns, dashedLegs } = buildRouteLegs([step(a), step(b, [alt], true)])
    expect(solidRuns).toEqual([]) // a→b is dashed now, leaving no >=2 run
    expect(dashedLegs).toEqual([
      { from: a, to: b },   // the original/spine, now an equal dashed option
      { from: a, to: alt }, // the alternative
    ])
  })

  it('resumes the solid path after an equalOptions step', () => {
    const a: LatLng = [0, 0], b: LatLng = [1, 1], c: LatLng = [2, 2]
    // a (solid) … b is equal (dashed in) … c (solid out of b)
    const { solidRuns, dashedLegs } = buildRouteLegs([step(a), step(b, [], true), step(c)])
    expect(solidRuns).toEqual([[b, c]]) // solid resumes b→c
    expect(dashedLegs).toEqual([{ from: a, to: b }])
  })
})

describe('normalizeSolidSegments', () => {
  it('returns null for empty / missing geometry', () => {
    expect(normalizeSolidSegments(null)).toBeNull()
    expect(normalizeSolidSegments(undefined)).toBeNull()
    expect(normalizeSolidSegments([])).toBeNull()
  })

  it('wraps a legacy flat polyline into a single segment', () => {
    const flat: LatLng[] = [[0, 0], [1, 1], [2, 2]]
    expect(normalizeSolidSegments(flat)).toEqual([flat])
  })

  it('passes through the segmented format unchanged', () => {
    const segs: LatLng[][] = [[[0, 0], [1, 1]], [[2, 2], [3, 3]]]
    expect(normalizeSolidSegments(segs)).toEqual(segs)
  })
})

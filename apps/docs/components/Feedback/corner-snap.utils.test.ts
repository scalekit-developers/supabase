import { describe, expect, it } from 'vitest'

import {
  getAdjacentPlacement,
  getNearestPlacement,
  type DockArrowKey,
  type DockPlacement,
} from './corner-snap.utils'

const VIEWPORT = { width: 1200, height: 800 }
const AT_REST = { x: 0, y: 0 }
const AT_REST_ARGS = { velocity: AT_REST, viewport: VIEWPORT }

describe('getNearestPlacement', () => {
  it('returns the quadrant of the release point when velocity is zero', () => {
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 1000, y: 700 } })).toBe(
      'bottom-right'
    )
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 100, y: 100 } })).toBe('top-left')
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 1000, y: 100 } })).toBe('top-right')
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 100, y: 700 } })).toBe('bottom-left')
  })

  it('projects a strong leftward fling into the left half', () => {
    expect(
      getNearestPlacement({
        point: { x: 1000, y: 700 },
        velocity: { x: -2000, y: 0 },
        viewport: VIEWPORT,
      })
    ).toBe('bottom-left')
  })

  it('snaps to the island only in the bottom middle band', () => {
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 600, y: 700 } })).toBe('center')
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 600, y: 100 } })).toBe('top-right')
    expect(getNearestPlacement({ ...AT_REST_ARGS, point: { x: 300, y: 700 } })).toBe('bottom-left')
  })
})

describe('getAdjacentPlacement', () => {
  const move = (placement: DockPlacement, key: DockArrowKey) =>
    getAdjacentPlacement({ placement, key })

  it('moves horizontally and vertically', () => {
    expect(move('bottom-left', 'ArrowUp')).toBe('top-left')
    expect(move('top-left', 'ArrowRight')).toBe('top-right')
    expect(move('top-right', 'ArrowDown')).toBe('bottom-right')
  })

  it('stays in place at the edge', () => {
    expect(move('bottom-right', 'ArrowRight')).toBe('bottom-right')
    expect(move('bottom-right', 'ArrowDown')).toBe('bottom-right')
    expect(move('top-left', 'ArrowUp')).toBe('top-left')
    expect(move('top-left', 'ArrowLeft')).toBe('top-left')
  })

  it('passes through the island between the bottom corners', () => {
    expect(move('bottom-right', 'ArrowLeft')).toBe('center')
    expect(move('bottom-left', 'ArrowRight')).toBe('center')
    expect(move('center', 'ArrowLeft')).toBe('bottom-left')
    expect(move('center', 'ArrowRight')).toBe('bottom-right')
    expect(move('center', 'ArrowUp')).toBe('center')
    expect(move('top-right', 'ArrowLeft')).toBe('top-left')
  })
})

import { describe, expect, test } from 'bun:test'

import { getBreakoutReleasePan, getResistedRevealPan } from '@/modules/map/lib/mapRevealMotion'

describe('map reveal motion', () => {
  test('resisted pan is behind the finger at the reveal distance', () => {
    const pan = getResistedRevealPan(170, 0, 170, 0.28)

    expect(pan.x).toBeCloseTo(122.4)
    expect(pan.y).toBe(0)
  })

  test('breakout release starts at resisted pan and ends at finger pan', () => {
    expect(getBreakoutReleasePan(170, 0, 122.4, 0, 0, 100)).toEqual({ x: 122.4, y: 0 })
    expect(getBreakoutReleasePan(170, 0, 122.4, 0, 100, 100)).toEqual({ x: 170, y: 0 })
  })

  test('breakout release closes the gap gradually', () => {
    const pan = getBreakoutReleasePan(170, 0, 122.4, 0, 50, 100)

    expect(pan.x).toBeGreaterThan(122.4)
    expect(pan.x).toBeLessThan(170)
  })
})

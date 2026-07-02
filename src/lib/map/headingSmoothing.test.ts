import { describe, expect, test } from 'bun:test'

import { smoothHeadingStep } from './headingSmoothing'

describe('smoothHeadingStep', () => {
  test('interpolates camera heading at frame rate instead of jumping to each sensor sample', () => {
    const firstFrame = smoothHeadingStep(0, 90, 16)

    expect(firstFrame).toBeGreaterThan(0)
    expect(firstFrame).toBeLessThan(90)
    expect(smoothHeadingStep(firstFrame, 90, 16)).toBeGreaterThan(firstFrame)
  })

  test('takes the shortest path across north and snaps at the target', () => {
    expect(smoothHeadingStep(350, 10, 16)).toBeGreaterThan(350)
    expect(smoothHeadingStep(359.96, 0, 16)).toBe(0)
  })
})

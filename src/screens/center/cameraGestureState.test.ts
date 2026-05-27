import { describe, expect, test } from 'bun:test'

import { shouldPreserveLiveFollowGesture } from './cameraGestureState'

describe('camera gesture state', () => {
  test('keeps live follow for zoom-only gestures near the followed fix', () => {
    expect(
      shouldPreserveLiveFollowGesture({
        followGps: true,
        historyActive: false,
        centerDistanceM: 12,
        headingDeg: 91,
        followHeadingDeg: 90,
      }),
    ).toBe(true)
  })

  test('enters browse when a gesture pans away from the followed fix', () => {
    expect(
      shouldPreserveLiveFollowGesture({
        followGps: true,
        historyActive: false,
        centerDistanceM: 120,
        headingDeg: 90,
        followHeadingDeg: 90,
      }),
    ).toBe(false)
  })

  test('enters browse when a gesture manually rotates away from follow heading', () => {
    expect(
      shouldPreserveLiveFollowGesture({
        followGps: true,
        historyActive: false,
        centerDistanceM: 0,
        headingDeg: 112,
        followHeadingDeg: 90,
      }),
    ).toBe(false)
  })
})

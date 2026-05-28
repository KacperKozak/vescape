import { describe, expect, test } from 'bun:test'
import type { LocationEvent } from 'vesc-ble'

import { getLiveGpsPresentation, getReliableGpsBearingFromFixes } from './liveGpsPresentation'

function location(overrides: Partial<LocationEvent> = {}): LocationEvent {
  return {
    latitude: 50,
    longitude: 19,
    speedMps: null,
    bearingDeg: null,
    accuracyM: 10,
    altitudeM: null,
    timestamp: 10_000,
    precise: true,
    ...overrides,
  }
}

describe('getLiveGpsPresentation', () => {
  test('uses approximate fix for initial camera and circle before first precise fix', () => {
    const approximate = location({ precise: false, accuracyM: 80 })

    expect(
      getLiveGpsPresentation({
        preciseFix: null,
        latestApproximateFix: approximate,
        initialApproximateFix: null,
      }),
    ).toMatchObject({
      cameraFix: approximate,
      accuracyFix: approximate,
      accuracyRadiusM: 80,
      nextInitialApproximateFix: approximate,
      degraded: false,
    })
  })

  test('keeps first approximate fix stable until precise fix arrives', () => {
    const first = location({ latitude: 50, precise: false, timestamp: 1_000 })
    const later = location({ latitude: 51, precise: false, timestamp: 2_000 })

    expect(
      getLiveGpsPresentation({
        preciseFix: null,
        latestApproximateFix: later,
        initialApproximateFix: first,
      }).cameraFix,
    ).toBe(first)
  })

  test('clears initial approximate fix once precise fix exists', () => {
    const precise = location({ timestamp: 3_000 })
    const approximate = location({ precise: false, timestamp: 1_000 })

    expect(
      getLiveGpsPresentation({
        preciseFix: precise,
        latestApproximateFix: approximate,
        initialApproximateFix: approximate,
      }),
    ).toMatchObject({
      cameraFix: precise,
      accuracyFix: precise,
      accuracyRadiusM: 10,
      nextInitialApproximateFix: null,
      degraded: false,
    })
  })

  test('shows degraded circle around precise fix after grace period', () => {
    const precise = location({ latitude: 50, longitude: 19, timestamp: 10_000, accuracyM: 5 })
    const approximate = location({
      latitude: 50.001,
      longitude: 19,
      timestamp: 13_000,
      precise: false,
      accuracyM: 30,
    })

    const presentation = getLiveGpsPresentation({
      preciseFix: precise,
      latestApproximateFix: approximate,
      initialApproximateFix: null,
    })

    expect(presentation.cameraFix).toBe(precise)
    expect(presentation.accuracyFix).toBe(precise)
    expect(presentation.accuracyRadiusM).toBeCloseTo(141, 0)
    expect(presentation.degraded).toBe(true)
  })

  test('ignores imprecise fixes inside grace period', () => {
    const precise = location({ timestamp: 10_000, accuracyM: 5 })
    const approximate = location({
      timestamp: 11_000,
      precise: false,
      accuracyM: 80,
    })

    expect(
      getLiveGpsPresentation({
        preciseFix: precise,
        latestApproximateFix: approximate,
        initialApproximateFix: null,
      }),
    ).toMatchObject({
      accuracyFix: precise,
      accuracyRadiusM: 5,
      degraded: false,
    })
  })

  test('uses moving GPS bearing as reliable direction', () => {
    const precise = location({ speedMps: 4, bearingDeg: 91 })

    expect(
      getLiveGpsPresentation({
        preciseFix: precise,
        latestApproximateFix: precise,
        initialApproximateFix: null,
      }),
    ).toMatchObject({
      directionBearingDeg: 91,
      nextReliableBearing: { bearingDeg: 91, sourceTimestamp: precise.timestamp },
    })
  })

  test('derives travel bearing when moving fix omits bearing', () => {
    const previous = location({ latitude: 50, longitude: 19, timestamp: 9_000 })
    const precise = location({
      latitude: 50.001,
      longitude: 19,
      timestamp: 10_000,
      speedMps: 4,
      bearingDeg: null,
    })

    expect(
      getLiveGpsPresentation({
        preciseFix: precise,
        previousPreciseFix: previous,
        latestApproximateFix: precise,
        initialApproximateFix: null,
      }).directionBearingDeg,
    ).toBeCloseTo(0, 0)
  })

  test('keeps reliable direction through a short stop or missing bearing update', () => {
    const previousReliableBearing = { bearingDeg: 120, sourceTimestamp: 10_000 }
    const stopped = location({ timestamp: 14_000, speedMps: 0, bearingDeg: null })

    expect(
      getLiveGpsPresentation({
        preciseFix: stopped,
        latestApproximateFix: stopped,
        initialApproximateFix: null,
        previousReliableBearing,
      }),
    ).toMatchObject({
      directionBearingDeg: 120,
      nextReliableBearing: previousReliableBearing,
    })
  })

  test('drops stale direction after live context stops updating bearing', () => {
    const stale = location({ timestamp: 25_000, speedMps: 0, bearingDeg: null })

    expect(
      getLiveGpsPresentation({
        preciseFix: stale,
        latestApproximateFix: stale,
        initialApproximateFix: null,
        previousReliableBearing: { bearingDeg: 120, sourceTimestamp: 10_000 },
      }).directionBearingDeg,
    ).toBeNull()
  })

  test('resolves reliable direction from current live GPS context only', () => {
    const fixes = [
      location({ timestamp: 10_000, speedMps: 4, bearingDeg: 180 }),
      location({ timestamp: 14_000, speedMps: 0, bearingDeg: null }),
    ]

    expect(getReliableGpsBearingFromFixes(fixes)).toEqual({
      bearingDeg: 180,
      sourceTimestamp: 10_000,
    })
    expect(getReliableGpsBearingFromFixes([])).toBeNull()
  })
})

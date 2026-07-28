import { expect, test } from 'bun:test'

import type { Favorite } from 'vescape-core'

import { favoriteRangeForSession, findSessionFavorite } from '@/modules/history/lib/favorites'

const session = {
  startAtMs: 1_000_000,
  endAtMs: 1_600_000,
  movingStartAtMs: 1_100_000,
  movingEndAtMs: 1_500_000,
  deviceId: 'board-1',
}

function favorite(overrides: Partial<Favorite>): Favorite {
  return {
    id: 'fav-1',
    deviceId: 'board-1',
    deviceName: 'VESC Board',
    name: null,
    startMs: 1_100_000,
    endMs: 1_500_000,
    createdAtMs: 0,
    updatedAtMs: 0,
    sampleCount: 0,
    gpsPointCount: 0,
    distanceM: null,
    movingDurationMs: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    batteryUsedWh: 0,
    ...overrides,
  }
}

test('star pins the full Moving Window, not the idle-padded ride span', () => {
  expect(favoriteRangeForSession(session)).toEqual({ startMs: 1_100_000, endMs: 1_500_000 })
})

test('legacy rides without a Moving Window fall back to their wall-clock span', () => {
  expect(
    favoriteRangeForSession({ ...session, movingStartAtMs: null, movingEndAtMs: null }),
  ).toEqual({ startMs: 1_000_000, endMs: 1_600_000 })
})

test('a ride counts as favorited only when a favorite covers its exact range and board', () => {
  expect(findSessionFavorite([favorite({})], session)?.id).toBe('fav-1')
  expect(findSessionFavorite([favorite({ endMs: 1_400_000 })], session)).toBeNull()
  expect(findSessionFavorite([favorite({ deviceId: 'board-2' })], session)).toBeNull()
})

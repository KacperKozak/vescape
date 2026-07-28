import { beforeEach, expect, mock, test } from 'bun:test'

import type { Favorite } from 'vescape-core'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

function favorite(overrides: Partial<Favorite> & Pick<Favorite, 'id' | 'startMs'>): Favorite {
  return {
    deviceId: 'board-1',
    deviceName: 'VESC Board',
    name: null,
    endMs: overrides.startMs + 60_000,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    sampleCount: 120,
    gpsPointCount: 20,
    distanceM: 1_180,
    movingDurationMs: 59_000,
    avgSpeedKmh: 20,
    maxSpeedKmh: 32,
    batteryUsedWh: 12.5,
    ...overrides,
  }
}

const getFavorites = mock(async () => [] as Favorite[])
const createFavorite = mock(async (): Promise<Favorite> => {
  throw new Error('createFavorite not stubbed')
})
const deleteFavorite = mock(async () => true)

const vescapeCoreMock = {
  ...actualVescapeCore,
  getFavorites,
  createFavorite,
  deleteFavorite,
}

mock.module('vescape-core', () => vescapeCoreMock)
mock.module('../../modules/vescape-core/src/index', () => vescapeCoreMock)

beforeEach(async () => {
  getFavorites.mockClear()
  createFavorite.mockClear()
  deleteFavorite.mockClear()
  getFavorites.mockImplementation(async () => [])
  createFavorite.mockImplementation(async () => {
    throw new Error('createFavorite not stubbed')
  })
  deleteFavorite.mockImplementation(async () => true)
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')
  useFavoriteStore.setState({ favorites: [], loading: false, error: undefined })
})

test('loads favorites from native', async () => {
  const stored = favorite({ id: 'fav-1', startMs: 2_000_000 })
  getFavorites.mockImplementation(async () => [stored])
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  await useFavoriteStore.getState().load()

  expect(useFavoriteStore.getState().favorites).toEqual([stored])
  expect(useFavoriteStore.getState().loading).toBe(false)
})

test('keeps the list newest first after adding a favorite', async () => {
  const older = favorite({ id: 'older', startMs: 1_000_000 })
  const newer = favorite({ id: 'newer', startMs: 3_000_000 })
  getFavorites.mockImplementation(async () => [older])
  createFavorite.mockImplementation(async () => newer)
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  await useFavoriteStore.getState().load()
  await useFavoriteStore.getState().add({ startMs: newer.startMs, endMs: newer.endMs })

  expect(useFavoriteStore.getState().favorites.map((f) => f.id)).toEqual(['newer', 'older'])
})

test('surfaces a create failure instead of inserting a phantom row', async () => {
  createFavorite.mockImplementation(async () => {
    throw new Error('range has no samples')
  })
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  const created = await useFavoriteStore.getState().add({ startMs: 1_000, endMs: 2_000 })

  expect(created).toBeNull()
  expect(useFavoriteStore.getState().favorites).toEqual([])
  expect(useFavoriteStore.getState().error).toBe('range has no samples')
})

test('removes only the deleted favorite', async () => {
  const kept = favorite({ id: 'kept', startMs: 1_000_000 })
  getFavorites.mockImplementation(async () => [favorite({ id: 'gone', startMs: 2_000_000 }), kept])
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  await useFavoriteStore.getState().load()
  await useFavoriteStore.getState().remove('gone')

  expect(deleteFavorite).toHaveBeenCalledWith('gone')
  expect(useFavoriteStore.getState().favorites).toEqual([kept])
})

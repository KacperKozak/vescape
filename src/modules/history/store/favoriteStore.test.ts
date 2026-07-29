import { beforeEach, expect, mock, test } from 'bun:test'

import type { Favorite } from 'vescape-core'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

function favorite(overrides: Partial<Favorite> & Pick<Favorite, 'id' | 'startMs'>): Favorite {
  return {
    boardId: 'board-uuid-1',
    boardName: 'Onewheel',
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
const renameFavorite = mock(async (): Promise<Favorite> => {
  throw new Error('renameFavorite not stubbed')
})
const deleteFavorite = mock(async () => true)

const vescapeCoreMock = {
  ...actualVescapeCore,
  getFavorites,
  createFavorite,
  renameFavorite,
  deleteFavorite,
}

mock.module('vescape-core', () => vescapeCoreMock)
mock.module('../../modules/vescape-core/src/index', () => vescapeCoreMock)

beforeEach(async () => {
  getFavorites.mockClear()
  createFavorite.mockClear()
  renameFavorite.mockClear()
  deleteFavorite.mockClear()
  getFavorites.mockImplementation(async () => [])
  createFavorite.mockImplementation(async () => {
    throw new Error('createFavorite not stubbed')
  })
  renameFavorite.mockImplementation(async () => {
    throw new Error('renameFavorite not stubbed')
  })
  deleteFavorite.mockImplementation(async () => true)
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')
  useFavoriteStore.setState({ favorites: [], loading: false, saving: false, error: undefined })
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

test('a second star tap while a create is in flight does not add a duplicate', async () => {
  const created = favorite({ id: 'fav-1', startMs: 2_000_000 })
  createFavorite.mockImplementation(async () => created)
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  const [first, second] = await Promise.all([
    useFavoriteStore.getState().add({ startMs: created.startMs, endMs: created.endMs }),
    useFavoriteStore.getState().add({ startMs: created.startMs, endMs: created.endMs }),
  ])

  expect(createFavorite).toHaveBeenCalledTimes(1)
  expect([first, second]).toEqual([created, null])
  expect(useFavoriteStore.getState().favorites).toEqual([created])
  expect(useFavoriteStore.getState().saving).toBe(false)
})

test('a rename mirrors the row native returns, without touching the others', async () => {
  const other = favorite({ id: 'other', startMs: 3_000_000 })
  const renamed = favorite({ id: 'fav-1', startMs: 1_000_000, name: 'Dolina single track' })
  getFavorites.mockImplementation(async () => [
    other,
    favorite({ id: 'fav-1', startMs: 1_000_000 }),
  ])
  renameFavorite.mockImplementation(async () => renamed)
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  await useFavoriteStore.getState().load()
  await useFavoriteStore.getState().rename('fav-1', 'Dolina single track')

  expect(renameFavorite).toHaveBeenCalledWith('fav-1', 'Dolina single track')
  expect(useFavoriteStore.getState().favorites).toEqual([other, renamed])
})

test('a failed rename leaves the stored name alone and surfaces the error', async () => {
  const stored = favorite({ id: 'fav-1', startMs: 1_000_000, name: 'Dolina' })
  getFavorites.mockImplementation(async () => [stored])
  renameFavorite.mockImplementation(async () => {
    throw new Error('favorite does not exist')
  })
  const { useFavoriteStore } = await import('@/modules/history/store/favoriteStore')

  await useFavoriteStore.getState().load()
  await useFavoriteStore.getState().rename('fav-1', null)

  expect(useFavoriteStore.getState().favorites).toEqual([stored])
  expect(useFavoriteStore.getState().error).toBe('favorite does not exist')
})

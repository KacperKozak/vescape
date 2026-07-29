import { beforeEach, expect, mock, test } from 'bun:test'
import type { MapPoint, MapPointCategory, MapPointPatch, MapPointReaction } from 'vescape-core'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

/** One server-shaped Map Point; only the fields a test cares about need overriding. */
function serverPoint(overrides: Partial<MapPoint> & Pick<MapPoint, 'id'>): MapPoint {
  return {
    category: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    name: null,
    description: null,
    score: 0,
    myReaction: null,
    ownedByMe: false,
    distanceMeters: 100,
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
    ...overrides,
  }
}

/** Native rejects with a coded error; the store turns the code into rider-facing words. */
class ApiError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

let nearbyResult: { items: MapPoint[]; truncated: boolean } = { items: [], truncated: false }
let nearbyError: Error | null = null
let writeError: Error | null = null
let settings = {
  directionPointLatitude: null as number | null,
  directionPointLongitude: null as number | null,
}

const getNearbyMapPoints = mock(async (_lat: number, _lng: number, _radius: number) => {
  if (nearbyError) throw nearbyError
  return nearbyResult
})
const createMapPoint = mock(
  async (values: { category: MapPointCategory; latitude: number; longitude: number }) => {
    if (writeError) throw writeError
    return serverPoint({ id: 'created-1', ...values })
  },
)
const updateMapPoint = mock(async (id: string, patch: MapPointPatch) => {
  if (writeError) throw writeError
  return serverPoint({ id, ...patch })
})
const deleteMapPoint = mock(async (_id: string) => {
  if (writeError) throw writeError
})
const setMapPointReaction = mock(async (_id: string, _reaction: MapPointReaction | null) => {
  if (writeError) throw writeError
})
const setDirectionPoint = mock(async (latitude: number | null, longitude: number | null) => {
  settings = { directionPointLatitude: latitude, directionPointLongitude: longitude }
})
const getSettings = mock(async () => settings)

mock.module('vescape-core', () => ({
  ...actualVescapeCore,
  getNearbyMapPoints,
  createMapPoint,
  updateMapPoint,
  deleteMapPoint,
  setMapPointReaction,
  setDirectionPoint,
  getSettings,
}))

const { useMapStore } = await import('@/modules/map/store/mapStore')

beforeEach(() => {
  nearbyResult = { items: [], truncated: false }
  nearbyError = null
  writeError = null
  settings = { directionPointLatitude: null, directionPointLongitude: null }
  useMapStore.setState({
    mapPoints: [],
    truncated: false,
    loading: false,
    error: null,
    directionPoint: null,
    selectedMapPointId: null,
    hiddenMapPointCategories: [],
    lastRead: null,
  })
  for (const fn of [
    getNearbyMapPoints,
    createMapPoint,
    updateMapPoint,
    deleteMapPoint,
    setMapPointReaction,
    setDirectionPoint,
    getSettings,
  ]) {
    fn.mockClear()
  }
})

test('a nearby read renders the server answer nearest first', async () => {
  nearbyResult = {
    items: [
      serverPoint({ id: 'far', distanceMeters: 900 }),
      serverPoint({ id: 'near', distanceMeters: 20 }),
    ],
    truncated: true,
  }

  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)

  const state = useMapStore.getState()
  expect(state.mapPoints.map((point) => point.id)).toEqual(['near', 'far'])
  expect(state.truncated).toBe(true)
  expect(state.error).toBeNull()
})

test('a camera nudge inside the last radius does not re-read', async () => {
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)
  await useMapStore.getState().refreshNearby(52.1001, 21.1001, 14)

  expect(getNearbyMapPoints).toHaveBeenCalledTimes(1)
})

test('panning far enough re-reads around the new centre', async () => {
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)
  await useMapStore.getState().refreshNearby(52.4, 21.6, 14)

  expect(getNearbyMapPoints).toHaveBeenCalledTimes(2)
})

/** Map Points are server-owned, so a failed read has nothing to fall back on. */
test('a failed read empties the map and reports why', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a' })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)

  nearbyError = new ApiError('MAP_POINT_UNREACHABLE')
  await useMapStore.getState().reload()

  const state = useMapStore.getState()
  expect(state.mapPoints).toEqual([])
  expect(state.error).toBe('Could not reach the server. Map features need a connection.')
})

/** Otherwise a rider parked on the spot would sit on an empty map until they panned far enough. */
test('a still camera retries after a failed read', async () => {
  nearbyError = new ApiError('MAP_POINT_UNREACHABLE')
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)

  nearbyError = null
  nearbyResult = { items: [serverPoint({ id: 'a' })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)

  expect(getNearbyMapPoints).toHaveBeenCalledTimes(2)
  expect(useMapStore.getState().mapPoints.map((point) => point.id)).toEqual(['a'])
  expect(useMapStore.getState().error).toBeNull()
})

test('creating a Map Point adds the server row, not a local guess', async () => {
  const point = await useMapStore.getState().addMapPoint('bonk', 52.2, 21.2)

  expect(createMapPoint).toHaveBeenCalledWith({
    category: 'bonk',
    latitude: 52.2,
    longitude: 21.2,
  })
  expect(point?.id).toBe('created-1')
  expect(useMapStore.getState().mapPoints.map((candidate) => candidate.id)).toEqual(['created-1'])
})

test('a refused write leaves the map alone and explains itself', async () => {
  writeError = new ApiError('MAP_POINT_SIGN_IN_REQUIRED')

  const point = await useMapStore.getState().addMapPoint('drop', 52.2, 21.2)

  expect(point).toBeNull()
  expect(useMapStore.getState().mapPoints).toEqual([])
  expect(useMapStore.getState().error).toBe('Sign in to add or change map features.')
})

test('voting is optimistic and adjusts the score locally', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a', score: 3 })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)

  await useMapStore.getState().setMapPointReaction('a', 'up')
  expect(useMapStore.getState().mapPoints[0]).toMatchObject({ myReaction: 'up', score: 4 })

  await useMapStore.getState().setMapPointReaction('a', 'down')
  expect(useMapStore.getState().mapPoints[0]).toMatchObject({ myReaction: 'down', score: 2 })

  await useMapStore.getState().setMapPointReaction('a', null)
  expect(useMapStore.getState().mapPoints[0]).toMatchObject({ myReaction: null, score: 3 })
})

test('a rejected vote rolls back to the previous reaction', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a', score: 3, myReaction: 'up' })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)
  writeError = new ApiError('MAP_POINT_UNREACHABLE')

  const result = await useMapStore.getState().setMapPointReaction('a', 'down')

  expect(result).toBeNull()
  expect(useMapStore.getState().mapPoints[0]).toMatchObject({ myReaction: 'up', score: 3 })
  expect(useMapStore.getState().error).toBe(
    'Could not reach the server. Map features need a connection.',
  )
})

test('deleting drops the point and its selection', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a', ownedByMe: true })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)
  useMapStore.getState().selectMapPoint('a')

  const removed = await useMapStore.getState().removeMapPoint('a')

  expect(removed).toBe(true)
  expect(useMapStore.getState().mapPoints).toEqual([])
  expect(useMapStore.getState().selectedMapPointId).toBeNull()
})

test('a failed delete keeps the point on the map', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a' })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)
  writeError = new ApiError('MAP_POINT_NOT_YOURS')

  const removed = await useMapStore.getState().removeMapPoint('a')

  expect(removed).toBe(false)
  expect(useMapStore.getState().mapPoints.map((point) => point.id)).toEqual(['a'])
  expect(useMapStore.getState().error).toBe('Only the rider who added this feature can change it.')
})

test('editing replaces the point with the server answer', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a' })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)

  const point = await useMapStore.getState().editMapPoint('a', { name: 'Kicker' })

  expect(updateMapPoint).toHaveBeenCalledWith('a', { name: 'Kicker' })
  expect(point?.name).toBe('Kicker')
  expect(useMapStore.getState().mapPoints[0].name).toBe('Kicker')
})

test('a read drops a selection the server no longer returns', async () => {
  nearbyResult = { items: [serverPoint({ id: 'a' })], truncated: false }
  await useMapStore.getState().refreshNearby(52.1, 21.1, 14)
  useMapStore.getState().selectMapPoint('a')

  nearbyResult = { items: [serverPoint({ id: 'b' })], truncated: false }
  await useMapStore.getState().reload()

  expect(useMapStore.getState().selectedMapPointId).toBeNull()
})

/** The direction target is personal client state and never reaches the Map Point API. */
test('the direction point round-trips through native settings', async () => {
  await useMapStore.getState().setDirectionPoint(52.5, 21.5)
  expect(setDirectionPoint).toHaveBeenCalledWith(52.5, 21.5)

  useMapStore.setState({ directionPoint: null })
  await useMapStore.getState().loadDirectionPoint()
  expect(useMapStore.getState().directionPoint).toEqual({ latitude: 52.5, longitude: 21.5 })

  await useMapStore.getState().clearDirectionPoint()
  expect(setDirectionPoint).toHaveBeenLastCalledWith(null, null)
  expect(useMapStore.getState().directionPoint).toBeNull()
  expect(createMapPoint).not.toHaveBeenCalled()
})

test('category visibility toggles on and off', () => {
  useMapStore.getState().toggleMapPointCategoryVisibility('drop')
  expect(useMapStore.getState().hiddenMapPointCategories).toEqual(['drop'])

  useMapStore.getState().toggleMapPointCategoryVisibility('drop')
  expect(useMapStore.getState().hiddenMapPointCategories).toEqual([])
})

import { beforeEach, expect, mock, test } from 'bun:test'
import type { MapPoint } from 'vesc-ble'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

let persistedMapPoints: MapPoint[] = []

const getMapPoints = mock(async () => persistedMapPoints)
const upsertMapPoint = mock(async (point: MapPoint) => {
  persistedMapPoints = [
    ...persistedMapPoints.filter((candidate) => candidate.id !== point.id),
    point,
  ]
})
const replaceDirectionMapPoint = mock(async (point: MapPoint) => {
  persistedMapPoints = [
    ...persistedMapPoints.filter((candidate) => candidate.kind !== 'direction'),
    { ...point, kind: 'direction' },
  ]
})
const deleteMapPoint = mock(async (id: string) => {
  persistedMapPoints = persistedMapPoints.filter((candidate) => candidate.id !== id)
})

const vescBleMock = {
  ...actualVescBle,
  getMapPoints,
  upsertMapPoint,
  replaceDirectionMapPoint,
  deleteMapPoint,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index', () => vescBleMock)

beforeEach(async () => {
  persistedMapPoints = []
  getMapPoints.mockClear()
  upsertMapPoint.mockClear()
  replaceDirectionMapPoint.mockClear()
  deleteMapPoint.mockClear()
  const { useMapStore } = await import('./mapStore')
  useMapStore.setState({
    mapPoints: [],
    selectedMapPointId: null,
    hiddenMapPointKinds: [],
    loaded: false,
  })
})

test('loads Map Points from native storage', async () => {
  const { useMapStore } = await import('./mapStore')
  const point: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    createdAt: 1000,
    updatedAt: 1000,
  }
  persistedMapPoints = [point]

  await useMapStore.getState().load()

  expect(useMapStore.getState().loaded).toBe(true)
  expect(useMapStore.getState().mapPoints).toEqual([point])
})

test('stores no independent targetLocation state', async () => {
  const { useMapStore } = await import('./mapStore')

  await useMapStore.getState().load()

  expect(Object.keys(useMapStore.getState())).not.toContain('targetLocation')
  expect(Object.keys(useMapStore.getState())).not.toContain('setTargetLocation')
  expect(Object.keys(useMapStore.getState())).not.toContain('clearTargetLocation')
})

test('saves and removes non-direction Map Points through native storage', async () => {
  const { useMapStore } = await import('./mapStore')

  const point = await useMapStore.getState().saveMapPoint('drop', 52.1, 21.1)

  expect(point.kind).toBe('drop')
  expect(useMapStore.getState().mapPoints).toEqual([point])
  expect(upsertMapPoint).toHaveBeenCalledWith(point)
  expect(replaceDirectionMapPoint).not.toHaveBeenCalled()

  await useMapStore.getState().removeMapPoint(point.id)

  expect(useMapStore.getState().mapPoints).toEqual([])
  expect(deleteMapPoint).toHaveBeenCalledWith(point.id)
})

test('replacing direction point leaves non-direction points intact', async () => {
  const { useMapStore } = await import('./mapStore')
  const drop: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const oldDirection: MapPoint = {
    id: 'direction-1',
    kind: 'direction',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  useMapStore.setState({ mapPoints: [drop, oldDirection], loaded: true })

  const next = await useMapStore.getState().replaceDirectionPoint(53.3, 22.3)

  expect(next.id).toBe(oldDirection.id)
  expect(next.createdAt).toBe(oldDirection.createdAt)
  expect(next.kind).toBe('direction')
  expect(
    useMapStore.getState().mapPoints.filter((point) => point.kind === 'direction'),
  ).toHaveLength(1)
  expect(useMapStore.getState().mapPoints.find((point) => point.id === drop.id)).toEqual(drop)
  expect(replaceDirectionMapPoint).toHaveBeenCalledWith(
    expect.objectContaining({ id: oldDirection.id }),
  )
})

test('saving direction point uses singleton replacement path', async () => {
  const { useMapStore } = await import('./mapStore')
  const oldDirection: MapPoint = {
    id: 'direction-1',
    kind: 'direction',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  useMapStore.setState({ mapPoints: [oldDirection], loaded: true })

  const next = await useMapStore.getState().saveMapPoint('direction', 53.3, 22.3)

  expect(next.id).toBe(oldDirection.id)
  expect(upsertMapPoint).not.toHaveBeenCalled()
  expect(replaceDirectionMapPoint).toHaveBeenCalledWith(
    expect.objectContaining({
      id: oldDirection.id,
      kind: 'direction',
      latitude: 53.3,
      longitude: 22.3,
    }),
  )
  expect(
    useMapStore.getState().mapPoints.filter((point) => point.kind === 'direction'),
  ).toHaveLength(1)
})

test('clears direction point through native storage', async () => {
  const { useMapStore } = await import('./mapStore')
  const direction: MapPoint = {
    id: 'direction-1',
    kind: 'direction',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  useMapStore.setState({ mapPoints: [direction], loaded: true })

  await useMapStore.getState().clearDirectionPoint()

  expect(useMapStore.getState().mapPoints).toEqual([])
  expect(deleteMapPoint).toHaveBeenCalledWith(direction.id)
})

test('toggles one non-direction Map Point selection at a time', async () => {
  const { useMapStore } = await import('./mapStore')
  const first: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const second: MapPoint = {
    id: 'bonk-1',
    kind: 'bonk',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  useMapStore.setState({ mapPoints: [first, second], selectedMapPointId: null, loaded: true })

  useMapStore.getState().toggleMapPointSelection(first.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(first.id)

  useMapStore.getState().toggleMapPointSelection(second.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(second.id)

  useMapStore.getState().toggleMapPointSelection(second.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(null)
})

test('ignores direction point selection', async () => {
  const { useMapStore } = await import('./mapStore')
  const direction: MapPoint = {
    id: 'direction-1',
    kind: 'direction',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  useMapStore.setState({ mapPoints: [direction], selectedMapPointId: null, loaded: true })

  useMapStore.getState().toggleMapPointSelection(direction.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(null)
})

test('clears selected non-direction Map Points without clearing direction point', async () => {
  const { useMapStore } = await import('./mapStore')
  const drop: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const direction: MapPoint = {
    id: 'direction-1',
    kind: 'direction',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  useMapStore.setState({
    mapPoints: [drop, direction],
    selectedMapPointId: drop.id,
    loaded: true,
  })

  useMapStore.getState().clearSelectedMapPoints()

  expect(useMapStore.getState().selectedMapPointId).toBe(null)
  expect(useMapStore.getState().getDirectionPoint()).toEqual(direction)
})

test('prunes stale selected Map Point id on remove and load', async () => {
  const { useMapStore } = await import('./mapStore')
  const drop: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const bonk: MapPoint = {
    id: 'bonk-1',
    kind: 'bonk',
    latitude: 52.2,
    longitude: 21.2,
    createdAt: 1100,
    updatedAt: 1100,
  }
  persistedMapPoints = [bonk]
  useMapStore.setState({
    mapPoints: [drop, bonk],
    selectedMapPointId: drop.id,
    loaded: true,
  })

  await useMapStore.getState().removeMapPoint(drop.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(null)

  useMapStore.setState({ selectedMapPointId: bonk.id })

  await useMapStore.getState().load()

  expect(useMapStore.getState().selectedMapPointId).toBe(bonk.id)

  useMapStore.setState({ selectedMapPointId: 'missing' })

  await useMapStore.getState().load()

  expect(useMapStore.getState().selectedMapPointId).toBe(null)
})

test('toggles Map Point Visibility without changing stored Map Points', async () => {
  const { useMapStore } = await import('./mapStore')
  const drop: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    createdAt: 1000,
    updatedAt: 1000,
  }
  useMapStore.setState({ mapPoints: [drop], hiddenMapPointKinds: [], loaded: true })

  useMapStore.getState().toggleMapPointKindVisibility('drop')

  expect(useMapStore.getState().hiddenMapPointKinds).toEqual(['drop'])
  expect(useMapStore.getState().mapPoints).toEqual([drop])
  expect(upsertMapPoint).not.toHaveBeenCalled()
  expect(deleteMapPoint).not.toHaveBeenCalled()

  useMapStore.getState().toggleMapPointKindVisibility('drop')

  expect(useMapStore.getState().hiddenMapPointKinds).toEqual([])
  expect(useMapStore.getState().mapPoints).toEqual([drop])
})

test('keeps direction Map Point always visible', async () => {
  const { useMapStore } = await import('./mapStore')

  useMapStore.getState().toggleMapPointKindVisibility('direction')

  expect(useMapStore.getState().hiddenMapPointKinds).toEqual([])
  expect(deleteMapPoint).not.toHaveBeenCalled()
})

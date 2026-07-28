import { beforeEach, expect, mock, test } from 'bun:test'
import type { MapPoint } from 'vescape-core'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

let persistedMapPoints: MapPoint[] = []
const persistedReactions = new Map<string, 'up' | 'down'>()
const clerkUserId = 'clerk-user-1'

class MockFile {
  uri: string
  exists = false

  constructor(...parts: unknown[]) {
    this.uri = parts.map(String).join('/')
  }

  delete() {
    this.exists = false
  }

  async copy() {}
}

class MockDirectory {
  exists = true

  create() {}

  delete() {
    this.exists = false
  }
}

const reactionScore = (reaction: 'up' | 'down' | null | undefined) =>
  reaction === 'up' ? 1 : reaction === 'down' ? -1 : 0
const reactionKey = (userId: string, pointId: string) => `${userId}:${pointId}`
const getMapPoints = mock(async (currentClerkUserId: string | null) =>
  persistedMapPoints.map((point) => {
    const reactions = [...persistedReactions.entries()]
      .filter(([key]) => key.endsWith(`:${point.id}`))
      .map(([, reaction]) => reaction)
    const reaction = currentClerkUserId
      ? (persistedReactions.get(reactionKey(currentClerkUserId, point.id)) ?? null)
      : null
    return {
      ...point,
      voteScore: reactions.reduce((score, value) => score + reactionScore(value), 0),
      myReaction: reaction,
    }
  }),
)
const upsertMapPoint = mock(async (point: MapPoint, _clerkUserId: string | null) => {
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
const deleteMapPoint = mock(async (id: string, _clerkUserId: string | null) => {
  persistedMapPoints = persistedMapPoints.filter((candidate) => candidate.id !== id)
  for (const key of persistedReactions.keys()) {
    if (key.endsWith(`:${id}`)) persistedReactions.delete(key)
  }
})
const setMapPointReaction = mock(
  async (id: string, userId: string, reaction: 'up' | 'down' | null) => {
    const key = reactionKey(userId, id)
    if (reaction == null) persistedReactions.delete(key)
    else persistedReactions.set(key, reaction)
  },
)

const vescBleMock = {
  ...actualVescapeCore,
  getMapPoints,
  upsertMapPoint,
  replaceDirectionMapPoint,
  deleteMapPoint,
  setMapPointReaction,
}

mock.module('vescape-core', () => vescBleMock)
mock.module('../../modules/vescape-core/src/index', () => vescBleMock)
mock.module('expo-file-system', () => ({
  Directory: MockDirectory,
  File: MockFile,
  Paths: { document: 'file:///document' },
}))

beforeEach(async () => {
  persistedMapPoints = []
  persistedReactions.clear()
  getMapPoints.mockClear()
  upsertMapPoint.mockClear()
  replaceDirectionMapPoint.mockClear()
  deleteMapPoint.mockClear()
  setMapPointReaction.mockClear()
  const { useMapStore } = await import('@/modules/map/store/mapStore')
  useMapStore.setState({
    mapPoints: [],
    selectedMapPointId: null,
    hiddenMapPointKinds: [],
    clerkUserId,
    loaded: false,
  })
})

test('loads Map Points from native storage', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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
  expect(useMapStore.getState().mapPoints).toEqual([{ ...point, voteScore: 0, myReaction: null }])
})

test('stores no independent targetLocation state', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')

  await useMapStore.getState().load()

  expect(Object.keys(useMapStore.getState())).not.toContain('targetLocation')
  expect(Object.keys(useMapStore.getState())).not.toContain('setTargetLocation')
  expect(Object.keys(useMapStore.getState())).not.toContain('clearTargetLocation')
})

test('requires a Clerk user id for community Map Point changes', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')
  useMapStore.setState({ clerkUserId: null })

  await expect(useMapStore.getState().saveMapPoint('drop', 52.1, 21.1)).rejects.toThrow(
    'Clerk sign-in is required',
  )
  expect(upsertMapPoint).not.toHaveBeenCalled()
})

test('saves and removes non-direction Map Points through native storage', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')

  const point = await useMapStore.getState().saveMapPoint('drop', 52.1, 21.1)

  expect(point.kind).toBe('drop')
  expect(useMapStore.getState().mapPoints).toEqual([point])
  expect(upsertMapPoint).toHaveBeenCalledWith(point, clerkUserId)
  expect(replaceDirectionMapPoint).not.toHaveBeenCalled()

  await useMapStore.getState().removeMapPoint(point.id)

  expect(useMapStore.getState().mapPoints).toEqual([])
  expect(deleteMapPoint).toHaveBeenCalledWith(point.id, clerkUserId)
})

test('updates non-direction Map Point metadata through native storage', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')

  const point = await useMapStore.getState().saveMapPoint('viewpoint', 52.1, 21.1)
  const updated = await useMapStore.getState().updateMapPoint(point.id, {
    name: 'Hill Lookout',
    description: 'Sunset line',
    media: [
      {
        id: 'media-1',
        uri: 'file:///mapPointMedia/viewpoint-1/photo.jpg',
        filename: 'photo.jpg',
        mediaType: 'photo',
      },
      {
        id: 'media-2',
        uri: 'file:///mapPointMedia/viewpoint-1/video.mp4',
        filename: 'video.mp4',
        mediaType: 'video',
      },
    ],
  })
  if (!updated) throw new Error('Expected Map Point metadata update')

  expect(updated).toEqual(
    expect.objectContaining({
      id: point.id,
      kind: 'viewpoint',
      name: 'Hill Lookout',
      description: 'Sunset line',
      media: [
        {
          id: 'media-1',
          uri: 'file:///mapPointMedia/viewpoint-1/photo.jpg',
          filename: 'photo.jpg',
          mediaType: 'photo',
        },
        {
          id: 'media-2',
          uri: 'file:///mapPointMedia/viewpoint-1/video.mp4',
          filename: 'video.mp4',
          mediaType: 'video',
        },
      ],
    }),
  )
  expect(useMapStore.getState().mapPoints[0]).toEqual(updated)
  expect(upsertMapPoint).toHaveBeenLastCalledWith(updated, clerkUserId)
})

test('stores Clerk-user reactions separately from Map Point metadata', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')

  const point = await useMapStore.getState().saveMapPoint('viewpoint', 52.1, 21.1)
  const saved = await useMapStore.getState().updateMapPoint(point.id, {
    name: 'Saved lookout',
    description: 'Survives process death',
    media: [{ id: 'photo-1', uri: 'file:///photo.jpg', filename: 'photo.jpg', mediaType: 'photo' }],
  })
  expect(saved?.name).toBe('Saved lookout')

  const liked = await useMapStore.getState().setMapPointReaction(point.id, 'up')
  expect(liked?.voteScore).toBe(1)
  expect(liked?.myReaction).toBe('up')
  expect(setMapPointReaction).toHaveBeenLastCalledWith(point.id, clerkUserId, 'up')
  expect(upsertMapPoint).toHaveBeenCalledTimes(2)

  const toggledOff = await useMapStore.getState().setMapPointReaction(point.id, null)
  expect(toggledOff?.voteScore).toBe(0)
  expect(toggledOff?.myReaction).toBe(null)

  const disliked = await useMapStore.getState().setMapPointReaction(point.id, 'down')
  expect(disliked?.voteScore).toBe(-1)
  expect(disliked?.myReaction).toBe('down')

  useMapStore.setState({ mapPoints: [], loaded: false })
  await useMapStore.getState().load()

  expect(useMapStore.getState().mapPoints[0]).toMatchObject({
    id: point.id,
    name: 'Saved lookout',
    description: 'Survives process death',
    voteScore: -1,
    myReaction: 'down',
  })
})

test('replacing direction point leaves non-direction points intact', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')
  const drop: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    authorId: clerkUserId,
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
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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
  expect(deleteMapPoint).toHaveBeenCalledWith(direction.id, null)
})

test('toggles one non-direction Map Point selection at a time', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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

test('selects one non-direction Map Point without toggling it off', async () => {
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

  useMapStore.getState().selectMapPoint(first.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(first.id)

  useMapStore.getState().selectMapPoint(first.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(first.id)

  useMapStore.getState().selectMapPoint(second.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(second.id)
})

test('ignores direction point selection', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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

test('ignores direction point explicit selection', async () => {
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

  useMapStore.getState().selectMapPoint(direction.id)

  expect(useMapStore.getState().selectedMapPointId).toBe(null)
})

test('clears selected non-direction Map Points without clearing direction point', async () => {
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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
  const { useMapStore } = await import('@/modules/map/store/mapStore')
  const drop: MapPoint = {
    id: 'drop-1',
    kind: 'drop',
    latitude: 52.1,
    longitude: 21.1,
    authorId: clerkUserId,
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
  const { useMapStore } = await import('@/modules/map/store/mapStore')
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
  const { useMapStore } = await import('@/modules/map/store/mapStore')

  useMapStore.getState().toggleMapPointKindVisibility('direction')

  expect(useMapStore.getState().hiddenMapPointKinds).toEqual([])
  expect(deleteMapPoint).not.toHaveBeenCalled()
})

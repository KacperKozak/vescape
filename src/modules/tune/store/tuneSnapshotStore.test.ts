import { beforeEach, expect, mock, test } from 'bun:test'

import type { RefloatConfigSnapshot } from 'vescape-core'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

const snapshot: RefloatConfigSnapshot = {
  capturedAt: 1000,
  boardId: 'board-1',
  canId: 1,
  schemaHash: 'schema',
  rawConfigHash: 'raw',
  rawConfigLength: 8,
  fwVersion: 'FW 6.05',
  missingFieldIds: [],
  groups: [],
}

const getRefloatConfigSnapshot = mock(async () => snapshot)

const vescBleMock = {
  ...actualVescapeCore,
  getRefloatConfigSnapshot,
}

mock.module('vescape-core', () => vescBleMock)
mock.module('../../modules/vescape-core/src/index', () => vescBleMock)

beforeEach(async () => {
  getRefloatConfigSnapshot.mockClear()
  getRefloatConfigSnapshot.mockImplementation(async () => snapshot)
  const { useBleStore } = await import('@/modules/board/store/bleStore')
  const { useTuneSnapshotStore } = await import('@/modules/tune/store/tuneSnapshotStore')
  useBleStore.setState({ linkIntegrity: 'trusted' })
  useTuneSnapshotStore.setState({ status: 'idle', snapshot: null, error: null })
  useTuneSnapshotStore.getState().clear()
})

test('joins concurrent board snapshot reads', async () => {
  const { useTuneSnapshotStore } = await import('@/modules/tune/store/tuneSnapshotStore')
  let resolveRead: ((snapshot: RefloatConfigSnapshot) => void) | undefined
  getRefloatConfigSnapshot.mockImplementation(
    () =>
      new Promise<RefloatConfigSnapshot>((resolve) => {
        resolveRead = resolve
      }),
  )

  const first = useTuneSnapshotStore.getState().read()
  const second = useTuneSnapshotStore.getState().read()

  expect(getRefloatConfigSnapshot).toHaveBeenCalledTimes(1)
  expect(useTuneSnapshotStore.getState().status).toBe('loading')

  resolveRead?.(snapshot)
  await Promise.all([first, second])

  expect(useTuneSnapshotStore.getState().status).toBe('ready')
  expect(useTuneSnapshotStore.getState().snapshot).toEqual(snapshot)
})

test('stores read errors without keeping stale board snapshots', async () => {
  const { useTuneSnapshotStore } = await import('@/modules/tune/store/tuneSnapshotStore')
  await useTuneSnapshotStore.getState().read()
  getRefloatConfigSnapshot.mockImplementation(async () => {
    throw new Error('Timed out reading Refloat config')
  })

  await useTuneSnapshotStore.getState().read()

  expect(useTuneSnapshotStore.getState().status).toBe('error')
  expect(useTuneSnapshotStore.getState().snapshot).toBeNull()
  expect(useTuneSnapshotStore.getState().error).toBe('Timed out reading Refloat config')
})

test('clear invalidates an in-flight read and permits a fresh read', async () => {
  const { useTuneSnapshotStore } = await import('@/modules/tune/store/tuneSnapshotStore')
  const staleSnapshot = { ...snapshot, capturedAt: 1000, canId: 1 }
  const freshSnapshot = { ...snapshot, capturedAt: 2000, canId: 2 }
  let resolveStale: ((snapshot: RefloatConfigSnapshot) => void) | undefined
  let resolveFresh: ((snapshot: RefloatConfigSnapshot) => void) | undefined
  getRefloatConfigSnapshot
    .mockImplementationOnce(
      () =>
        new Promise<RefloatConfigSnapshot>((resolve) => {
          resolveStale = resolve
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<RefloatConfigSnapshot>((resolve) => {
          resolveFresh = resolve
        }),
    )

  const staleRead = useTuneSnapshotStore.getState().read()
  useTuneSnapshotStore.getState().clear()
  const freshRead = useTuneSnapshotStore.getState().read()

  expect(getRefloatConfigSnapshot).toHaveBeenCalledTimes(2)

  resolveStale?.(staleSnapshot)
  await staleRead
  expect(useTuneSnapshotStore.getState().status).toBe('loading')
  expect(useTuneSnapshotStore.getState().read()).toBe(freshRead)

  resolveFresh?.(freshSnapshot)
  await freshRead

  expect(useTuneSnapshotStore.getState().status).toBe('ready')
  expect(useTuneSnapshotStore.getState().snapshot).toEqual(freshSnapshot)
})

test('setSnapshot stores a pushed board snapshot', async () => {
  const { useTuneSnapshotStore } = await import('@/modules/tune/store/tuneSnapshotStore')

  useTuneSnapshotStore.getState().setSnapshot(snapshot)

  expect(useTuneSnapshotStore.getState().status).toBe('ready')
  expect(useTuneSnapshotStore.getState().snapshot).toEqual(snapshot)
  expect(useTuneSnapshotStore.getState().error).toBeNull()
})

test.each([
  ['checking', 'Checking trusted board link.'],
  ['outdated', 'Re-link board before firmware commands.'],
  ['mismatched', 'Connected board does not match saved link.'],
] as const)('blocks board snapshot reads while link is %s', async (linkIntegrity, message) => {
  const { useBleStore } = await import('@/modules/board/store/bleStore')
  const { useTuneSnapshotStore } = await import('@/modules/tune/store/tuneSnapshotStore')
  useBleStore.setState({ linkIntegrity })

  await useTuneSnapshotStore.getState().read()

  expect(getRefloatConfigSnapshot).not.toHaveBeenCalled()
  expect(useTuneSnapshotStore.getState().status).toBe('error')
  expect(useTuneSnapshotStore.getState().error).toBe(message)
})

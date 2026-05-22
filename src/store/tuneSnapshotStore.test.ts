import { beforeEach, expect, mock, test } from 'bun:test'

import type { RefloatConfigSnapshot } from 'vesc-ble'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

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
  ...actualVescBle,
  getRefloatConfigSnapshot,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index', () => vescBleMock)

beforeEach(async () => {
  getRefloatConfigSnapshot.mockClear()
  getRefloatConfigSnapshot.mockImplementation(async () => snapshot)
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')
  useTuneSnapshotStore.setState({ status: 'idle', snapshot: null, error: null })
  useTuneSnapshotStore.getState().clear()
})

test('joins concurrent board snapshot reads', async () => {
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')
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
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')
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
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')
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
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')

  useTuneSnapshotStore.getState().setSnapshot(snapshot)

  expect(useTuneSnapshotStore.getState().status).toBe('ready')
  expect(useTuneSnapshotStore.getState().snapshot).toEqual(snapshot)
  expect(useTuneSnapshotStore.getState().error).toBeNull()
})

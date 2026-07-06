import { expect, mock, test } from 'bun:test'

import type { RefloatConfigSnapshot } from 'vesc-ble'

import { refreshBoardSnapshotAndProfiles } from './useTuneScreenData'

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

test('reloads profiles after board snapshot read seeds the first Tune Profile', async () => {
  const readBoardSnapshot = mock(async () => snapshot)
  const loadProfiles = mock(async (_boardId: string) => [])

  await refreshBoardSnapshotAndProfiles({
    boardConnected: true,
    selectedBoardId: 'board-1',
    readBoardSnapshot,
    loadProfiles,
  })

  expect(readBoardSnapshot).toHaveBeenCalledTimes(1)
  expect(loadProfiles).toHaveBeenCalledWith('board-1')
})

test('does not reload profiles when the snapshot belongs to another board', async () => {
  const readBoardSnapshot = mock(async () => ({ ...snapshot, boardId: 'board-2' }))
  const loadProfiles = mock(async (_boardId: string) => [])

  await refreshBoardSnapshotAndProfiles({
    boardConnected: true,
    selectedBoardId: 'board-1',
    readBoardSnapshot,
    loadProfiles,
  })

  expect(loadProfiles).not.toHaveBeenCalled()
})

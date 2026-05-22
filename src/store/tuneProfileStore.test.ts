import { beforeEach, expect, mock, test } from 'bun:test'

import type { RefloatConfigSnapshot, TuneProfile } from 'vesc-ble'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

const profile: TuneProfile = {
  id: 'profile-1',
  boardId: 'board-1',
  name: 'Main',
  fields: {
    kp: 20,
    atr_strength_up: 1.2,
  },
  createdAt: 1000,
  updatedAt: 1000,
}

const otherBoardProfile: TuneProfile = {
  id: 'profile-2',
  boardId: 'board-2',
  name: 'Other',
  fields: {
    kp: 30,
  },
  createdAt: 1000,
  updatedAt: 1000,
}

const boardSnapshot: RefloatConfigSnapshot = {
  capturedAt: 1000,
  boardId: 'board-1',
  canId: 1,
  schemaHash: 'schema',
  rawConfigHash: 'raw',
  rawConfigLength: 8,
  fwVersion: 'FW 6.05',
  missingFieldIds: [],
  groups: [
    {
      id: 'general',
      title: 'General',
      fields: [
        {
          id: 'kp',
          label: 'Angle P',
          value: 24,
          unit: null,
          min: 0,
          max: 50,
        },
      ],
    },
  ],
}

const getTuneProfiles = mock(async (_boardId: string) => [profile])
const getTuneProfile = mock(async () => profile)
const saveProfile = mock(async (_profileId: string, fields: TuneProfile['fields']) => ({
  ...profile,
  fields,
  updatedAt: 2000,
}))
const createProfile = mock(async () => profile)
const renameProfile = mock(async () => profile)
const deleteProfile = mock(async () => {})
const getProfileHistory = mock(async () => [])
const rollbackProfile = mock(async () => profile)
const copyProfileToBoard = mock(async () => profile)
const pushProfileToBoard = mock(async () => boardSnapshot)

const vescBleMock = {
  ...actualVescBle,
  getTuneProfiles,
  getTuneProfile,
  saveProfile,
  createProfile,
  renameProfile,
  deleteProfile,
  getProfileHistory,
  rollbackProfile,
  copyProfileToBoard,
  pushProfileToBoard,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index', () => vescBleMock)

beforeEach(async () => {
  getTuneProfiles.mockClear()
  getTuneProfiles.mockImplementation(async (_boardId: string) => [profile])
  getTuneProfile.mockClear()
  saveProfile.mockClear()
  pushProfileToBoard.mockClear()
  pushProfileToBoard.mockImplementation(async () => boardSnapshot)
  const { useTuneProfileStore } = await import('./tuneProfileStore')
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')
  useTuneProfileStore.setState({
    profiles: [],
    activeProfile: null,
    activeBoardId: null,
    draftFields: {},
    hasDirtyFields: false,
    boardFields: {},
    boardDiff: [],
    hasBoardDiff: false,
    loading: false,
    saving: false,
    syncing: false,
    error: null,
  })
  useTuneSnapshotStore.getState().clear()
})

test('tracks draft field edits as an overlay on the saved Tune Profile', async () => {
  const { useTuneProfileStore } = await import('./tuneProfileStore')

  await useTuneProfileStore.getState().loadProfiles('board-1')
  useTuneProfileStore.getState().setDraftField('kp', 23)

  expect(useTuneProfileStore.getState().activeProfile?.fields.kp).toBe(20)
  expect(useTuneProfileStore.getState().draftFields).toEqual({ kp: 23 })
  expect(useTuneProfileStore.getState().hasDirtyFields).toBe(true)
  expect(useTuneProfileStore.getState().getDirtyFields()).toEqual({ kp: 23 })

  useTuneProfileStore.getState().revertField('kp')

  expect(useTuneProfileStore.getState().draftFields).toEqual({})
  expect(useTuneProfileStore.getState().hasDirtyFields).toBe(false)
})

test('computes board diff against saved profile independently of draft edits', async () => {
  const { useTuneProfileStore } = await import('./tuneProfileStore')

  await useTuneProfileStore.getState().loadProfiles('board-1')
  useTuneProfileStore.getState().setDraftField('kp', 25)
  useTuneProfileStore.getState().setBoardSnapshot({
    capturedAt: 1000,
    boardId: 'board-1',
    canId: 0,
    schemaHash: 'schema',
    rawConfigHash: 'raw',
    rawConfigLength: 2,
    fwVersion: null,
    missingFieldIds: [],
    groups: [
      {
        id: 'general',
        title: 'General',
        fields: [
          {
            id: 'kp',
            label: 'Angle P',
            value: 22,
            unit: null,
            min: 0,
            max: 50,
          },
          {
            id: 'atr_strength_up',
            label: 'ATR Uphill Strength',
            value: 1.2,
            unit: null,
            min: 0,
            max: 2,
          },
        ],
      },
    ],
  })

  expect(useTuneProfileStore.getState().boardDiff).toEqual([
    { fieldId: 'kp', profileValue: 20, boardValue: 22 },
  ])
  expect(useTuneProfileStore.getState().hasBoardDiff).toBe(true)
  expect(useTuneProfileStore.getState().draftFields).toEqual({ kp: 25 })
})

test('accepts board values into draft and saves through normal profile flow', async () => {
  const { useTuneProfileStore } = await import('./tuneProfileStore')

  await useTuneProfileStore.getState().loadProfiles('board-1')
  useTuneProfileStore.getState().setBoardSnapshot({
    capturedAt: 1000,
    boardId: 'board-1',
    canId: 0,
    schemaHash: 'schema',
    rawConfigHash: 'raw',
    rawConfigLength: 2,
    fwVersion: null,
    missingFieldIds: [],
    groups: [
      {
        id: 'general',
        title: 'General',
        fields: [
          {
            id: 'kp',
            label: 'Angle P',
            value: 22,
            unit: null,
            min: 0,
            max: 50,
          },
        ],
      },
    ],
  })

  useTuneProfileStore.getState().acceptBoardField('kp')

  expect(useTuneProfileStore.getState().draftFields).toEqual({ kp: 22 })
  expect(useTuneProfileStore.getState().hasDirtyFields).toBe(true)

  await useTuneProfileStore.getState().saveActiveProfile()

  expect(saveProfile).toHaveBeenCalledWith('profile-1', {
    kp: 22,
    atr_strength_up: 1.2,
  })
  expect(useTuneProfileStore.getState().boardDiff).toEqual([])
  expect(useTuneProfileStore.getState().hasBoardDiff).toBe(false)
})

test('saves dirty fields through native saveProfile and clears the draft', async () => {
  const { useTuneProfileStore } = await import('./tuneProfileStore')

  await useTuneProfileStore.getState().loadProfiles('board-1')
  useTuneProfileStore.getState().setDraftField('kp', 24)
  await useTuneProfileStore.getState().saveActiveProfile()

  expect(saveProfile).toHaveBeenCalledWith('profile-1', {
    kp: 24,
    atr_strength_up: 1.2,
  })
  expect(useTuneProfileStore.getState().activeProfile?.fields.kp).toBe(24)
  expect(useTuneProfileStore.getState().draftFields).toEqual({})
  expect(useTuneProfileStore.getState().hasDirtyFields).toBe(false)
})

test('ignores stale profile loads when board selection changes', async () => {
  const { useTuneProfileStore } = await import('./tuneProfileStore')
  let resolveBoard1: ((profiles: TuneProfile[]) => void) | undefined
  let resolveBoard2: ((profiles: TuneProfile[]) => void) | undefined
  getTuneProfiles.mockImplementation(
    (boardId: string) =>
      new Promise<TuneProfile[]>((resolve) => {
        if (boardId === 'board-1') {
          resolveBoard1 = resolve
        } else {
          resolveBoard2 = resolve
        }
      }),
  )

  const staleLoad = useTuneProfileStore.getState().loadProfiles('board-1')
  const currentLoad = useTuneProfileStore.getState().loadProfiles('board-2')
  resolveBoard2?.([otherBoardProfile])
  await currentLoad

  expect(useTuneProfileStore.getState().activeBoardId).toBe('board-2')
  expect(useTuneProfileStore.getState().activeProfile?.id).toBe('profile-2')

  resolveBoard1?.([profile])
  await staleLoad

  expect(useTuneProfileStore.getState().activeBoardId).toBe('board-2')
  expect(useTuneProfileStore.getState().activeProfile?.id).toBe('profile-2')
  expect(useTuneProfileStore.getState().profiles).toEqual([otherBoardProfile])
})

test('syncToBoard updates tune snapshot store with pushed board snapshot', async () => {
  const { useTuneProfileStore } = await import('./tuneProfileStore')
  const { useTuneSnapshotStore } = await import('./tuneSnapshotStore')

  await useTuneProfileStore.getState().loadProfiles('board-1')
  await useTuneProfileStore.getState().syncToBoard()

  expect(pushProfileToBoard).toHaveBeenCalledWith('profile-1')
  expect(useTuneSnapshotStore.getState().status).toBe('ready')
  expect(useTuneSnapshotStore.getState().snapshot).toEqual(boardSnapshot)
  expect(useTuneProfileStore.getState().boardDiff).toEqual([
    { fieldId: 'kp', profileValue: 20, boardValue: 24 },
  ])
})

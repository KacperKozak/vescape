import { beforeEach, expect, mock, test } from 'bun:test'

import type { TuneProfile } from 'vesc-ble'

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

const getTuneProfiles = mock(async () => [profile])
const getTuneProfile = mock(async () => profile)
const saveProfile = mock(async (_profileId: string, fields: TuneProfile['fields']) => ({
  ...profile,
  fields,
  updatedAt: 2000,
}))

const vescBleMock = {
  getTuneProfiles,
  getTuneProfile,
  saveProfile,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index.ts', () => vescBleMock)

beforeEach(async () => {
  getTuneProfiles.mockClear()
  getTuneProfile.mockClear()
  saveProfile.mockClear()
  const { useTuneProfileStore } = await import('./tuneProfileStore')
  useTuneProfileStore.setState({
    profiles: [],
    activeProfile: null,
    activeBoardId: null,
    draftFields: {},
    hasDirtyFields: false,
    loading: false,
    saving: false,
    error: null,
  })
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

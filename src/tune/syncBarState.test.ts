import { expect, test } from 'bun:test'

import { getSyncBarState } from '@/tune/syncBarState'

test('allows saving dirty profile edits while board config is still loading', () => {
  expect(
    getSyncBarState({
      hasProfile: true,
      bleStatus: 'connected',
      hasDirtyFields: true,
      hasBoardDiff: false,
      dirtyCount: 2,
      diffCount: 0,
      loadingConfig: true,
      configError: null,
      boardSnapshotReady: false,
      saving: false,
      syncing: false,
    }),
  ).toEqual({ variant: 'save_later', dirtyCount: 2, diffCount: 0, configError: null })
})

test('shows board config loading when there are no local edits', () => {
  expect(
    getSyncBarState({
      hasProfile: true,
      bleStatus: 'connected',
      hasDirtyFields: false,
      hasBoardDiff: false,
      dirtyCount: 0,
      diffCount: 0,
      loadingConfig: true,
      configError: null,
      boardSnapshotReady: false,
      saving: false,
      syncing: false,
    }),
  ).toEqual({ variant: 'loading_config', dirtyCount: 0, diffCount: 0, configError: null })
})

test('does not claim board is up to date when board config read failed', () => {
  expect(
    getSyncBarState({
      hasProfile: true,
      bleStatus: 'connected',
      hasDirtyFields: false,
      hasBoardDiff: false,
      dirtyCount: 0,
      diffCount: 0,
      loadingConfig: false,
      configError: 'Timed out reading Refloat config',
      boardSnapshotReady: false,
      saving: false,
      syncing: false,
    }),
  ).toEqual({
    variant: 'config_error',
    dirtyCount: 0,
    diffCount: 0,
    configError: 'Timed out reading Refloat config',
  })
})

test('allows local save but not save and sync when board config read failed', () => {
  expect(
    getSyncBarState({
      hasProfile: true,
      bleStatus: 'connected',
      hasDirtyFields: true,
      hasBoardDiff: false,
      dirtyCount: 1,
      diffCount: 0,
      loadingConfig: false,
      configError: 'Timed out reading Refloat config',
      boardSnapshotReady: false,
      saving: false,
      syncing: false,
    }),
  ).toEqual({
    variant: 'save_later',
    dirtyCount: 1,
    diffCount: 0,
    configError: 'Timed out reading Refloat config',
  })
})

test('only offers save and sync after real board snapshot is ready', () => {
  expect(
    getSyncBarState({
      hasProfile: true,
      bleStatus: 'connected',
      hasDirtyFields: true,
      hasBoardDiff: false,
      dirtyCount: 1,
      diffCount: 0,
      loadingConfig: false,
      configError: null,
      boardSnapshotReady: true,
      saving: false,
      syncing: false,
    }),
  ).toEqual({ variant: 'save_and_sync', dirtyCount: 1, diffCount: 0, configError: null })
})

test('only claims board is up to date after real board snapshot is ready', () => {
  expect(
    getSyncBarState({
      hasProfile: true,
      bleStatus: 'connected',
      hasDirtyFields: false,
      hasBoardDiff: false,
      dirtyCount: 0,
      diffCount: 0,
      loadingConfig: false,
      configError: null,
      boardSnapshotReady: true,
      saving: false,
      syncing: false,
    }),
  ).toEqual({ variant: 'up_to_date', dirtyCount: 0, diffCount: 0, configError: null })
})

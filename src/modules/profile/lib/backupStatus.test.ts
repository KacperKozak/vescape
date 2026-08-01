import { describe, expect, test } from 'bun:test'
import type { SyncStatus } from 'vescape-core'

import { backupStatusCopy } from './backupStatus'

const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  accountId: 'acc_1',
  pendingRows: 0,
  activity: 'upToDate',
  pause: null,
  lastUploadAtMs: null,
  ...patch,
})

const NOW = 1_800_000_000_000

describe('backupStatusCopy', () => {
  test('names every backup state, so a stopped backup never renders as nothing', () => {
    const activities: SyncStatus['activity'][] = [
      'disabled',
      'signedOut',
      'upToDate',
      'syncing',
      'waitingForWifi',
      'offline',
      'paused',
    ]
    for (const activity of activities) {
      expect(backupStatusCopy(status({ activity }), NOW).label).not.toBe('')
    }
  })

  test('distinguishes the three pause reasons the Rider has to act on', () => {
    const labels = (['authentication', 'protocol', 'rowTooLarge'] as const).map(
      (pause) => backupStatusCopy(status({ activity: 'paused', pause }), NOW).label,
    )
    expect(new Set(labels).size).toBe(3)
    // A pause with no reason is still a stopped backup, not an empty line.
    expect(backupStatusCopy(status({ activity: 'paused' }), NOW).label).toBe('Backup paused')
  })

  test('up to date carries the upload time only once there has been one', () => {
    expect(backupStatusCopy(status({ lastUploadAtMs: NOW - 5 * 60_000 }), NOW).label).toBe(
      'Backed up 5m ago',
    )
    expect(backupStatusCopy(status({}), NOW).label).toBe('Backed up')
  })

  test('syncing counts the pending rows', () => {
    expect(backupStatusCopy(status({ activity: 'syncing', pendingRows: 1 }), NOW).label).toBe(
      'Backing up 1 change…',
    )
    expect(backupStatusCopy(status({ activity: 'syncing', pendingRows: 4 }), NOW).label).toBe(
      'Backing up 4 changes…',
    )
  })
})

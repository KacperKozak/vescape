import { describe, expect, test } from 'bun:test'
import type { AppStatus } from 'vescape-core'

import { selectAvailableUpdate } from './availableUpdate'

function appStatus(installed: string, latest: string): AppStatus {
  return {
    version: { installed, latest, status: 'current', message: null },
    messages: [],
  }
}

describe('selectAvailableUpdate', () => {
  test('selects an older installed marketing version', () => {
    expect(selectAvailableUpdate(appStatus('0.79.9', '0.80.2'))).toEqual({
      latestVersion: '0.80.2',
    })
  })

  test('hides an equal installed marketing version', () => {
    expect(selectAvailableUpdate(appStatus('0.80.2', '0.80.2'))).toBeNull()
  })

  test('hides a newer installed marketing version', () => {
    expect(selectAvailableUpdate(appStatus('0.81.0', '0.80.2'))).toBeNull()
  })

  test('hides unavailable or non-normalized latest-version state', () => {
    expect(selectAvailableUpdate(null)).toBeNull()
    expect(selectAvailableUpdate(appStatus('0.80.1', ''))).toBeNull()
    expect(selectAvailableUpdate(appStatus('0.80.1', 'v0.80.2'))).toBeNull()
  })
})

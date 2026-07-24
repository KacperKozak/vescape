import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppStatus, AppVersionStatus } from 'vescape-core'

import { appBlockMessage, shouldBlockApp } from './appBlock'

const FALLBACK = 'default block'

function status(version: AppVersionStatus, message: string | null = null): AppStatus {
  return {
    version: { installed: '0.70.0', latest: '0.80.2', status: version, message },
    messages: [],
  }
}

describe('shouldBlockApp', () => {
  test('blocks on app-blocked', () => {
    expect(shouldBlockApp(status('app-blocked'))).toBe(true)
  })

  test('never blocks for any other resolved status', () => {
    for (const version of ['current', 'update-warning', 'online-blocked'] as const) {
      expect(shouldBlockApp(status(version))).toBe(false)
    }
  })

  test('fails open while App Status is unknown', () => {
    expect(shouldBlockApp(null)).toBe(false)
  })

  test('stays blocked as long as native keeps reporting the block (in-process retention)', () => {
    // Native retains the last successful block for the process; the selector is stateless, so a
    // repeated app-blocked status keeps blocking. A later fail-open would only surface here as
    // `null`, which native never emits once a block is retained.
    const retained = status('app-blocked')
    expect(shouldBlockApp(retained)).toBe(true)
    expect(shouldBlockApp(retained)).toBe(true)
  })
})

describe('appBlockMessage', () => {
  test('uses the server message when present', () => {
    expect(appBlockMessage(status('app-blocked', '# Blocked'), FALLBACK)).toBe('# Blocked')
  })

  test('falls back to the bundled default when the rule carries none', () => {
    expect(appBlockMessage(status('app-blocked'), FALLBACK)).toBe(FALLBACK)
  })

  test('returns null when the app is not blocked', () => {
    expect(appBlockMessage(status('current'), FALLBACK)).toBeNull()
    expect(appBlockMessage(status('update-warning'), FALLBACK)).toBeNull()
    expect(appBlockMessage(null, FALLBACK)).toBeNull()
  })
})

describe('App Block preserves already-running native work', () => {
  // Regression guard (PRD story 9): the App Block presentation must never command an active Board
  // Session or Ride Recording to stop. No RN test renderer exists in-repo, so assert the presentation
  // source references none of the native stop intents — the block is render-only over live work.
  const STOP_INTENTS = [
    'setSelectedBoard',
    'setTelemetryRecordingEnabled',
    'setDebugRecordingEnabled',
    'stopScan',
    'leaveGroupRide',
    'stopGroupRideObserve',
    'disconnect',
  ]

  const presentationFiles = [
    '../components/AppBlockGate.tsx',
    '../components/AppBlockScreen.tsx',
    './appBlock.ts',
  ]

  for (const file of presentationFiles) {
    const source = readFileSync(join(import.meta.dir, file), 'utf8')
    for (const intent of STOP_INTENTS) {
      test(`${file} does not call ${intent}`, () => {
        expect(source).not.toContain(intent)
      })
    }
  }

  test('the gate wires only openAppUpdate from vescape-core', () => {
    const gate = readFileSync(join(import.meta.dir, '../components/AppBlockGate.tsx'), 'utf8')
    const coreImport = gate.match(/import\s*\{([^}]*)\}\s*from\s*'vescape-core'/)
    expect(coreImport).not.toBeNull()
    const names = coreImport![1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    expect(names).toEqual(['openAppUpdate'])
  })
})

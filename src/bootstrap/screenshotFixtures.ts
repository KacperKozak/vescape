import { useEffect, useState } from 'react'
import { restoreDatabase, startDebugReplay, updateSetting } from 'vescape-core'

import { captureMode } from '@/config/env'
import {
  screenshotDatabaseFile,
  screenshotFixtureUri,
  screenshotReplayName,
} from '@/config/screenshotMode'
import {
  SCREENSHOT_REPLAY_WARMUP_MS,
  SCREENSHOT_REPLAY_WARMUP_SPEED,
} from '@/config/screenshotWarmup'

async function applyFixtures(): Promise<void> {
  if (screenshotDatabaseFile) {
    await restoreDatabase(screenshotFixtureUri(screenshotDatabaseFile))
    // The restore swaps the database under the app; settings live there too, so this must come
    // after it. A replay session is a real session to `RecordingCoordinator` — auto-recording would
    // write a synthetic ride into the fixture history we are about to photograph.
    await updateSetting('autoRecording', false)
  }
  // Warm the live charts so the panels have a filled window to photograph instead of the empty
  // sparklines a session that just connected would show. Native fast-forwards the recording's first
  // three minutes at 30x — about six seconds of real waiting — then plays on at 1x.
  if (screenshotReplayName) {
    await startDebugReplay(screenshotReplayName, {
      warmupMs: SCREENSHOT_REPLAY_WARMUP_MS,
      warmupSpeed: SCREENSHOT_REPLAY_WARMUP_SPEED,
    })
  }
}

/**
 * Stages the screenshot run's data before the app boots: restores the pushed backup zip (history,
 * boards, tunes, alerts) and starts the Debug Recording replay that feeds the live panels.
 *
 * Returns `true` immediately in every normal build. In screenshot mode the caller holds the app
 * unmounted until this resolves, so the stores read the restored database on their first load
 * instead of racing a mid-flight database swap.
 */
export function useScreenshotFixtures(): boolean {
  const [ready, setReady] = useState(!captureMode)

  useEffect(() => {
    if (!captureMode) return
    let cancelled = false
    void (async () => {
      try {
        await applyFixtures()
      } catch (error) {
        // A broken fixture must not brick the run — boot anyway so the failure is visible on screen.
        console.warn('[screenshots] fixture setup failed', error)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return ready
}

import { useEffect, useState } from 'react'
import { File } from 'expo-file-system'
import { restoreDatabase, startDebugReplay, updateSetting } from 'vescape-core'

import {
  screenshotFixtureDir,
  screenshotManifestPath,
  screenshotModeEnabled,
  type ScreenshotManifest,
} from '@/config/screenshotMode'

async function readManifest(): Promise<ScreenshotManifest | null> {
  const file = new File(screenshotManifestPath)
  if (!file.exists) return null
  return JSON.parse(await file.text()) as ScreenshotManifest
}

async function applyFixtures(manifest: ScreenshotManifest): Promise<void> {
  if (manifest.database) {
    await restoreDatabase(`file://${screenshotFixtureDir}/${manifest.database}`)
    // The restore swaps the database under the app; settings live there too, so this must come
    // after it. A replay session is a real session to `RecordingCoordinator` — auto-recording would
    // write a synthetic ride into the fixture history we are about to photograph.
    await updateSetting('autoRecording', false)
  }
  if (manifest.replay) await startDebugReplay(manifest.replay)
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
  const [ready, setReady] = useState(!screenshotModeEnabled)

  useEffect(() => {
    if (!screenshotModeEnabled) return
    let cancelled = false
    void (async () => {
      try {
        const manifest = await readManifest()
        if (manifest) await applyFixtures(manifest)
        else console.warn(`[screenshots] no manifest at ${screenshotManifestPath}`)
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

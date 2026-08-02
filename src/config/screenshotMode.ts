import { applicationId } from '@/config/appVariant'

/**
 * Screenshot capture mode: a Release build with `EXPO_PUBLIC_SCREENSHOTS=1` and `EXPO_PUBLIC_E2E`
 * unset, driven by `scripts/screenshots.ts` to produce store-ready frames from the real app.
 *
 * Deliberately independent of `EXPO_PUBLIC_E2E`: the e2e flag reroutes board/telemetry reads to
 * `e2eFake` (`vescape-core`), which would hide the native replay session the screenshots depend on.
 * Screenshot mode runs the production path end to end and only suppresses developer chrome.
 */
export const screenshotModeEnabled = process.env.EXPO_PUBLIC_SCREENSHOTS === '1'

/**
 * Where the runner stages fixtures. The app's external files dir is writable by `adb push` and
 * readable by the app without any runtime permission, so it works on a non-debuggable Release build.
 */
export const screenshotFixtureDir = `/storage/emulated/0/Android/data/${applicationId}/files/screenshots`

/** Manifest the runner writes next to the fixtures; see `startScreenshotFixtures`. */
export const screenshotManifestPath = `${screenshotFixtureDir}/manifest.json`

/** Runner-written fixture manifest. Both fields are optional — either half can be skipped. */
export interface ScreenshotManifest {
  /** Backup zip filename inside `screenshotFixtureDir`, restored via `restoreDatabase`. */
  database?: string
  /** Debug Recording name replayed at 1x through the real telemetry pipeline. */
  replay?: string
}

import { Paths } from 'expo-file-system'
import { Platform } from 'react-native'

import { applicationId } from '@/config/appVariant'

/**
 * Fixture staging for a screenshot capture run: which recording to replay, which database backup to
 * restore, and where the runner put it. The flag that turns capture mode on lives in
 * `@/config/env` — this file is the run's plumbing, not the switch. It imports `react-native`, so
 * anything the Node runner also needs belongs in `@/config/screenshotWarmup` instead.
 */

/** Debug Recording replayed through the real telemetry pipeline. */
export const screenshotReplayName = process.env.EXPO_PUBLIC_SCREENSHOTS_REPLAY ?? ''

/** Backup zip filename the runner pushed into `screenshotFixtureDir`; empty skips the restore. */
export const screenshotDatabaseFile = process.env.EXPO_PUBLIC_SCREENSHOTS_DB ?? ''

/**
 * Where the runner stages the backup zip, per platform: the app's own external files dir on
 * Android (what `adb push` can write to) and the app's Documents dir on iOS (what the runner can
 * copy into via `simctl get_app_container`). Both are read by native `restoreDatabase` — a
 * `ContentResolver` open on Android, a `Data(contentsOf:)` on iOS.
 *
 * On Android `expo-file-system` cannot be used here: it sandboxes paths outside the app's document
 * and cache directories, so `Directory.create` is rejected and `File.exists` reads as false no
 * matter what is on disk. That is also why the capture run carries its fixture names as build-time
 * env vars rather than a manifest file the app would have to read.
 *
 * @parity /scripts/lib/androidCapture.ts
 * @parity /scripts/lib/iosCapture.ts
 */
export const screenshotFixtureDir =
  Platform.OS === 'ios'
    ? Paths.document.uri.replace(/\/$/, '')
    : `/storage/emulated/0/Android/data/${applicationId}/files`

export function screenshotFixtureUri(name: string): string {
  const base = screenshotFixtureDir
  return base.startsWith('file://') ? `${base}/${name}` : `file://${base}/${name}`
}

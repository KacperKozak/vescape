import type { AppStatus } from 'vescape-core'

/**
 * Whether the exceptional App Block should replace normal JS interaction. True only when the
 * resolved App Status is `app-blocked`. App Block is not dismissible, so — unlike the Update
 * Warning — there is no per-launch dismissal input here.
 *
 * `status` is `null` until the first successful native fetch (fail-open), so an offline fresh launch
 * never blocks. A block resolved earlier this process stays active because native keeps emitting it;
 * this selector holds no state of its own.
 */
export function shouldBlockApp(status: AppStatus | null): boolean {
  return status?.version.status === 'app-blocked'
}

/**
 * The Markdown message to render inside the App Block shell, or `null` when the app is not blocked.
 * Falls back to the bundled default when the server rule carries no message.
 */
export function appBlockMessage(status: AppStatus | null, fallback: string): string | null {
  if (!shouldBlockApp(status)) return null
  return status?.version.message ?? fallback
}

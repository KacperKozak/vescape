import type { AppStatus } from 'vescape-core'

/**
 * The projected App Status decision inputs the Update Warning surface reads. Kept RN-free so the
 * once-per-cold-launch logic is unit-testable without the native bridge.
 */
export interface UpdateWarningInputs {
  /** Latest native App Status, or `null` when no successful fetch has landed this process. */
  status: AppStatus | null
  /** Whether the rider dismissed the Update Warning for this cold launch. */
  updateWarningDismissed: boolean
}

/**
 * Whether the Update Warning should be presented now: the resolved status is `update-warning` and
 * the rider has not dismissed it this cold launch.
 */
export function shouldShowUpdateWarning(inputs: UpdateWarningInputs): boolean {
  return inputs.status?.version.status === 'update-warning' && !inputs.updateWarningDismissed
}

/**
 * The Markdown message to render for the current Update Warning, or `null` when there is nothing to
 * show. Falls back to the bundled default when the server rule carries no message.
 */
export function updateWarningMessage(inputs: UpdateWarningInputs, fallback: string): string | null {
  if (!shouldShowUpdateWarning(inputs)) return null
  return inputs.status?.version.message ?? fallback
}

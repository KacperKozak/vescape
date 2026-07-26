import type { AppStatus } from 'vescape-core'

export interface AvailableUpdate {
  latestVersion: string
}

const MARKETING_VERSION = /^(\d+)\.(\d+)\.(\d+)$/

function parseMarketingVersion(version: string): [number, number, number] | null {
  const match = MARKETING_VERSION.exec(version)
  if (!match) return null

  const parts = match.slice(1).map(Number)
  if (parts.some((part) => !Number.isSafeInteger(part))) return null
  return parts as [number, number, number]
}

/**
 * Select the passive latest-version affordance from native App Status.
 *
 * Native/server supply normalized marketing versions. Unknown or malformed state fails open, and a
 * future/dev build stays current when its installed version is newer than the advertised latest.
 */
export function selectAvailableUpdate(status: AppStatus | null): AvailableUpdate | null {
  if (!status) return null

  const installed = parseMarketingVersion(status.version.installed)
  const latest = parseMarketingVersion(status.version.latest)
  if (!installed || !latest) return null

  for (let index = 0; index < installed.length; index += 1) {
    if (installed[index] < latest[index]) {
      return { latestVersion: status.version.latest }
    }
    if (installed[index] > latest[index]) return null
  }

  return null
}

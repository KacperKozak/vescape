import type { AppStatus, CommunityMessage } from 'vescape-core'

import { DEFAULT_APP_BLOCK_MESSAGE } from '@/modules/release/constants/appBlock'
import { DEFAULT_ONLINE_BLOCK_MESSAGE } from '@/modules/release/constants/onlineBlock'
import { DEFAULT_UPDATE_WARNING_MESSAGE } from '@/modules/release/constants/updateWarning'
import { currentCommunityMessage } from '@/modules/release/lib/communityMessages'

/**
 * The one Release surface to present now. Only ever one: React Native presents a single modal at a
 * time on iOS, so stacked surfaces would silently swallow each other.
 */
export type ReleaseSurface =
  | { kind: 'app-block'; message: string }
  | { kind: 'online-block'; message: string }
  | { kind: 'update-warning'; message: string }
  | { kind: 'community-message'; message: CommunityMessage }

/** The projected state the Release surfaces read. Kept RN-free so precedence is unit-testable. */
export interface ReleaseSurfaceInputs {
  /** Latest native App Status, or `null` when no successful fetch has landed this process. */
  status: AppStatus | null
  /** Whether the rider dismissed the version notice (Update Warning / Online Block) this launch. */
  versionNoticeDismissed: boolean
  /** Durably acknowledged Community Message IDs. */
  dismissedCommunityMessageIds: string[]
}

/**
 * Pick the surface to present, in precedence order:
 *
 * 1. **App Block** — non-dismissible and update-only, so nothing may cover or precede it.
 * 2. **Online Block** — tells the rider once per cold launch why Online Capabilities are denied.
 * 3. **Update Warning** — recommends an update once per cold launch.
 * 4. **Community Message** — the head of the announcement queue.
 *
 * `status` is `null` until the first successful native fetch (fail-open), so an offline fresh launch
 * shows no Release surface at all.
 */
export function selectReleaseSurface(inputs: ReleaseSurfaceInputs): ReleaseSurface | null {
  const version = inputs.status?.version

  if (version?.status === 'app-blocked') {
    return { kind: 'app-block', message: version.message ?? DEFAULT_APP_BLOCK_MESSAGE }
  }

  if (version?.status === 'online-blocked' && !inputs.versionNoticeDismissed) {
    return { kind: 'online-block', message: version.message ?? DEFAULT_ONLINE_BLOCK_MESSAGE }
  }

  if (version?.status === 'update-warning' && !inputs.versionNoticeDismissed) {
    return { kind: 'update-warning', message: version.message ?? DEFAULT_UPDATE_WARNING_MESSAGE }
  }

  const message = currentCommunityMessage(
    inputs.status?.messages ?? [],
    inputs.dismissedCommunityMessageIds,
  )
  return message ? { kind: 'community-message', message } : null
}

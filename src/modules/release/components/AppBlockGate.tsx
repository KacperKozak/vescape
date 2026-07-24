import { openAppUpdate } from 'vescape-core'

import { AppBlockScreen } from '@/modules/release/components/AppBlockScreen'
import { DEFAULT_APP_BLOCK_MESSAGE } from '@/modules/release/constants/appBlock'
import { appBlockMessage } from '@/modules/release/lib/appBlock'
import { useAppStatusStore } from '@/modules/release/store/appStatusStore'

/**
 * Covers normal navigation with the update-only App Block shell whenever native App Status resolves
 * `app-blocked`. Renders the server Markdown message (or the bundled default when the rule carries
 * none) and routes its single action to the stable platform download endpoint.
 *
 * App Block is not dismissible and holds no JS state: it follows native App Status directly, so a
 * block resolved earlier this process stays up while native keeps emitting it, and an offline fresh
 * launch (`status === null`) never blocks (PRD stories 8, 11, 12). Mount above navigation so it
 * covers every screen without touching any Board Session or Ride Recording work.
 */
export function AppBlockGate() {
  const message = useAppStatusStore((state) =>
    appBlockMessage(state.status, DEFAULT_APP_BLOCK_MESSAGE),
  )

  return (
    <AppBlockScreen
      visible={message !== null}
      message={message ?? DEFAULT_APP_BLOCK_MESSAGE}
      onUpdate={openAppUpdate}
    />
  )
}

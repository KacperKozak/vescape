import { useUser } from '@clerk/expo'

import type { BackupSlot } from '@/modules/profile/lib/backupSlot'

/**
 * The one place backup state enters the UI.
 *
 * TODO(#276): replace the body with a projection of `useSyncStatusStore` — `signedOut` →
 * `signedOut`, `upToDate` → `idle`, `syncing` → `syncing` with `backupProgress()` counts, and the
 * paused/offline reasons once the tile has copy for them. Until the uploader exists, a signed-in
 * Rider is told backup is not in this build rather than being shown a green "backed up".
 */
export function useBackupSlot(): BackupSlot {
  const { isSignedIn } = useUser()
  return isSignedIn ? { kind: 'unavailable' } : { kind: 'signedOut' }
}

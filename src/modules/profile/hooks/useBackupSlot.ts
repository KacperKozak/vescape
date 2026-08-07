import type { BackupSlot } from '@/modules/profile/lib/backupSlot'

/**
 * The one place backup state enters the UI.
 *
 * TODO(#276): replace the body with a projection of `useSyncStatusStore` — `signedOut` →
 * `signedOut`, `upToDate` → `idle`, `syncing` → `syncing` with `backupProgress()` counts, and the
 * paused/offline reasons once the tile has copy for them.
 *
 * Until the uploader exists there is no backup for any Rider, signed in or not, so this reports
 * `unavailable` unconditionally: offering "sign in to back up" would promise a capability this
 * build does not have.
 */
export function useBackupSlot(): BackupSlot {
  return { kind: 'unavailable' }
}

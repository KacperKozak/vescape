import type { SyncPauseReason, SyncStatus } from 'vescape-core'

import { fmtTimeAgo } from '@/helpers/format'
import { theme } from '@/constants/theme'

export interface BackupStatusCopy {
  /** The one line the Rider reads. */
  label: string
  /** Colour of the status dot and the line, from the shared status palette. */
  color: string
  /** True while the uploader is actively working, so the line can spin rather than sit still. */
  busy: boolean
}

/**
 * What the Rider has to do about a pause, in the same three shapes the native notification names.
 * Every reason is actionable — none of them clears through ordinary retry.
 */
const PAUSE_LABELS: Record<SyncPauseReason, string> = {
  authentication: 'Backup paused — sign in again',
  protocol: 'Backup paused — update required',
  rowTooLarge: 'Backup paused — backup error',
}

/**
 * Native-owned backup state as one line of rider-facing copy.
 *
 * Pure: the clock is `nowMs` and the caller owns it. Every state native can report has a line here —
 * a backup that has silently stopped must never render as nothing at all.
 */
export function backupStatusCopy(status: SyncStatus, nowMs = Date.now()): BackupStatusCopy {
  switch (status.activity) {
    case 'signedOut':
      return {
        label: 'Sign in to back up your rides',
        color: theme.palette.slate.textMuted,
        busy: false,
      }
    case 'upToDate':
      return {
        label: status.lastUploadAtMs
          ? `Backed up ${fmtTimeAgo(status.lastUploadAtMs, nowMs)}`
          : 'Backed up',
        color: theme.status.success.text,
        busy: false,
      }
    case 'syncing':
      return {
        label: `Backing up ${status.pendingRows} ${status.pendingRows === 1 ? 'change' : 'changes'}…`,
        color: theme.palette.cyan.color,
        busy: true,
      }
    case 'waitingForWifi':
      return {
        label: 'Waiting for Wi-Fi to back up',
        color: theme.palette.slate.textMuted,
        busy: false,
      }
    case 'offline':
      return {
        label: 'Offline — backup will resume',
        color: theme.palette.slate.textMuted,
        busy: false,
      }
    case 'paused':
      return {
        // A paused uploader always carries a reason; an absent one is still a stopped backup.
        label: status.pause ? PAUSE_LABELS[status.pause] : 'Backup paused',
        color: theme.status.error.text,
        busy: false,
      }
  }
}

export type SyncBarVariant =
  | 'up_to_date'
  | 'connect_to_sync'
  | 'save_later'
  | 'save_and_sync'
  | 'sync_with_board'
  | 'saving'
  | 'syncing'

export interface SyncBarState {
  variant: SyncBarVariant
  dirtyCount: number
  diffCount: number
}

export function getSyncBarState(params: {
  hasProfile: boolean
  bleStatus: string
  hasDirtyFields: boolean
  hasBoardDiff: boolean
  dirtyCount: number
  diffCount: number
  saving: boolean
  syncing: boolean
}): SyncBarState | null {
  const {
    hasProfile,
    bleStatus,
    hasDirtyFields,
    hasBoardDiff,
    dirtyCount,
    diffCount,
    saving,
    syncing,
  } = params
  if (!hasProfile) return null
  if (saving) return { variant: 'saving', dirtyCount, diffCount }
  if (syncing) return { variant: 'syncing', dirtyCount, diffCount }
  const connected = bleStatus === 'connected'
  if (hasDirtyFields && connected) return { variant: 'save_and_sync', dirtyCount, diffCount }
  if (hasDirtyFields) return { variant: 'save_later', dirtyCount, diffCount }
  if (hasBoardDiff && connected) return { variant: 'sync_with_board', dirtyCount, diffCount }
  if (!connected) return { variant: 'connect_to_sync', dirtyCount, diffCount }
  return { variant: 'up_to_date', dirtyCount, diffCount }
}

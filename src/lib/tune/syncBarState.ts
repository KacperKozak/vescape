type SyncBarVariant =
  | 'loading_config'
  | 'config_error'
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
  configError: string | null
}

export function getSyncBarState(params: {
  hasProfile: boolean
  bleStatus: string
  hasDirtyFields: boolean
  hasBoardDiff: boolean
  dirtyCount: number
  diffCount: number
  loadingConfig: boolean
  configError: string | null
  boardSnapshotReady: boolean
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
    loadingConfig,
    configError,
    boardSnapshotReady,
    saving,
    syncing,
  } = params
  if (!hasProfile) return null
  if (saving) return { variant: 'saving', dirtyCount, diffCount, configError: null }
  if (syncing) return { variant: 'syncing', dirtyCount, diffCount, configError: null }
  const connected = bleStatus === 'connected'
  if (hasDirtyFields && connected && boardSnapshotReady) {
    return { variant: 'save_and_sync', dirtyCount, diffCount, configError: null }
  }
  if (hasDirtyFields) return { variant: 'save_later', dirtyCount, diffCount, configError }
  if (loadingConfig) return { variant: 'loading_config', dirtyCount, diffCount, configError: null }
  if (configError) return { variant: 'config_error', dirtyCount, diffCount, configError }
  if (hasBoardDiff && connected && boardSnapshotReady) {
    return { variant: 'sync_with_board', dirtyCount, diffCount, configError: null }
  }
  if (!connected) return { variant: 'connect_to_sync', dirtyCount, diffCount, configError: null }
  if (!boardSnapshotReady)
    return { variant: 'loading_config', dirtyCount, diffCount, configError: null }
  return { variant: 'up_to_date', dirtyCount, diffCount, configError: null }
}

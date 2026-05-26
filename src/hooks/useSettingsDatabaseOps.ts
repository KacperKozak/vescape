import { useCallback, useEffect, useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import {
  addTelemetryRebuildProgressListener,
  backupDatabase,
  getDatabaseSizeBytes,
  rebuildTelemetryBuckets,
  restoreDatabase,
} from 'vesc-ble'

import { useSettingsStore } from '@/store/settingsStore'
import { useHistoryStore } from '@/store/historyStore'

type OpState = 'idle' | 'running' | 'done' | 'error'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function useSettingsDatabaseOps() {
  const [dbSize, setDbSize] = useState<number | null>(null)
  const [rebuildState, setRebuildState] = useState<OpState>('idle')
  const [rebuildResult, setRebuildResult] = useState<string | null>(null)
  const [backupState, setBackupState] = useState<OpState>('idle')
  const [backupResult, setBackupResult] = useState<string | null>(null)
  const [restoreState, setRestoreState] = useState<OpState>('idle')
  const [restoreResult, setRestoreResult] = useState<string | null>(null)
  const [restoreConfirmVisible, setRestoreConfirmVisible] = useState(false)
  const [rebuildProgress, setRebuildProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  const refreshDatabaseSize = useCallback(() => {
    getDatabaseSizeBytes()
      .then(setDbSize)
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshDatabaseSize()
  }, [refreshDatabaseSize])

  useEffect(() => {
    const subscription = addTelemetryRebuildProgressListener((event) => {
      setRebuildProgress(event)
    })
    return () => subscription.remove()
  }, [])

  const handleRebuildBuckets = useCallback(async () => {
    setRebuildState('running')
    setRebuildResult(null)
    setRebuildProgress(null)
    try {
      await rebuildTelemetryBuckets()
      setRebuildState('done')
      setRebuildResult(null)
      setRebuildProgress(null)
    } catch (e: any) {
      setRebuildState('error')
      setRebuildResult(e?.message ?? 'Unknown error')
      setRebuildProgress(null)
    }
  }, [])

  const handleBackupDatabase = useCallback(async () => {
    setBackupState('running')
    setBackupResult(null)
    try {
      const backup = await backupDatabase()
      await Sharing.shareAsync(backup.uri, {
        mimeType: 'application/zip',
        dialogTitle: 'Save or send database backup',
        UTI: 'com.pkware.zip-archive',
      })
      setBackupState('done')
      setBackupResult(`${backup.name} (${formatBytes(backup.sizeBytes)})`)
      refreshDatabaseSize()
    } catch (e: any) {
      setBackupState('error')
      setBackupResult(e?.message ?? 'Backup failed')
    }
  }, [refreshDatabaseSize])

  const handleRestoreDatabase = useCallback(async () => {
    setRestoreConfirmVisible(false)
    setRestoreState('running')
    setRestoreResult(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      })
      if (result.canceled) {
        setRestoreState('idle')
        return
      }
      const uri = result.assets[0]?.uri
      if (!uri) throw new Error('No backup file selected')
      await restoreDatabase(uri)
      await Promise.all([
        useSettingsStore.getState().load(),
        useHistoryStore.getState().loadInitial(),
      ])
      setRestoreState('done')
      setRestoreResult('Database restored')
      refreshDatabaseSize()
    } catch (e: any) {
      setRestoreState('error')
      setRestoreResult(e?.message ?? 'Restore failed')
    }
  }, [refreshDatabaseSize])

  const rebuildHint =
    rebuildState === 'error' && rebuildResult
      ? rebuildResult
      : 'Refresh historical data with newest algorithms'
  const rebuildProgressValue =
    rebuildProgress && rebuildProgress.total > 0
      ? Math.min(1, rebuildProgress.current / rebuildProgress.total)
      : 0
  const rebuildProgressLabel = rebuildProgress
    ? `${rebuildProgress.current}/${rebuildProgress.total}`
    : null
  const backupHint =
    backupState === 'error' && backupResult
      ? backupResult
      : backupState === 'done' && backupResult
        ? backupResult
        : 'Create a shareable zip for debugging'
  const restoreHint =
    restoreState === 'error' && restoreResult
      ? restoreResult
      : restoreState === 'done' && restoreResult
        ? restoreResult
        : 'Replace current database from backup zip'

  return {
    dbSize,
    rebuildState,
    rebuildHint,
    rebuildProgressValue,
    rebuildProgressLabel,
    backupState,
    backupHint,
    restoreState,
    restoreHint,
    restoreConfirmVisible,
    setRestoreConfirmVisible,
    handleRebuildBuckets,
    handleBackupDatabase,
    handleRestoreDatabase,
  }
}

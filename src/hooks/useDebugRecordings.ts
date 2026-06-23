import { useCallback, useEffect, useState } from 'react'
import * as Sharing from 'expo-sharing'
import { exportDebugRecording, listDebugRecordings, type DebugRecording } from 'vesc-ble'

import { useBleStore } from '@/store/bleStore'

export function useDebugRecordings() {
  const enabled = useBleStore((state) => state.recordDebugSession)
  const setEnabled = useBleStore((state) => state.setRecordDebugSession)
  const [recordings, setRecordings] = useState<DebugRecording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportingName, setExportingName] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRecordings(await listDebugRecordings())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load debug recordings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(timeout)
  }, [refresh])

  const exportRecording = useCallback(async (recording: DebugRecording) => {
    setExportingName(recording.name)
    setError(null)
    try {
      const file = await exportDebugRecording(recording.name)
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/x-ndjson',
        dialogTitle: 'Export debug recording',
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export debug recording')
    } finally {
      setExportingName(null)
    }
  }, [])

  return {
    enabled,
    setEnabled,
    recordings,
    loading,
    error,
    exportingName,
    refresh,
    exportRecording,
  }
}

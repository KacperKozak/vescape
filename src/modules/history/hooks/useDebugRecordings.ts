import { useCallback, useEffect, useState } from 'react'
import * as Sharing from 'expo-sharing'
import {
  exportDebugRecording,
  listBundledDebugFixtures,
  listDebugRecordings,
  startDebugReplay,
  type DebugFixture,
  type DebugRecording,
} from 'vescape-core'

import { useBleStore } from '@/modules/board/store/bleStore'

export function useDebugRecordings() {
  const enabled = useBleStore((state) => state.recordDebugSession)
  const setEnabled = useBleStore((state) => state.setRecordDebugSession)
  const [recordings, setRecordings] = useState<DebugRecording[]>([])
  const [fixtures, setFixtures] = useState<DebugFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportingName, setExportingName] = useState<string | null>(null)
  const [replayingName, setReplayingName] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [device, bundled] = await Promise.all([
        listDebugRecordings(),
        listBundledDebugFixtures(),
      ])
      setRecordings(device)
      setFixtures(bundled)
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

  /** Start a native replay session; the normal live UI takes over (REPLAY badge, disconnect to stop). */
  const replayRecording = useCallback(async (name: string): Promise<boolean> => {
    setReplayingName(name)
    setError(null)
    try {
      await startDebugReplay(name)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start replay')
      return false
    } finally {
      setReplayingName(null)
    }
  }, [])

  return {
    enabled,
    setEnabled,
    recordings,
    fixtures,
    loading,
    error,
    exportingName,
    replayingName,
    refresh,
    exportRecording,
    replayRecording,
  }
}

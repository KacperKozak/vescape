import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useSettingsStore } from '@/store/settingsStore'
import { usePermissions } from '@/ble/usePermissions'
import { useBleAppLifecycle } from '@/hooks/useBleAppLifecycle'
import { useBoardConnection } from '@/hooks/useBoardConnection'
import { CenterScreen } from '@/screens/CenterScreen'
import { theme } from '@/constants/theme'

export default function MainScreen() {
  const autoConnectAttemptedBoardRef = useRef<string | null>(null)
  const load = useBoardStore((s) => s.load)
  const { activeBoardId, boardsLoaded } = useBoardStore(
    useShallow((s) => ({ activeBoardId: s.activeBoardId, boardsLoaded: s.hasLoaded })),
  )
  const startGpsTracking = useBleStore((s) => s.startGpsTracking)
  const { status: permStatus, request } = usePermissions()

  const { autoConnect, settingsLoaded, loadSettings } = useSettingsStore(
    useShallow((s) => ({
      autoConnect: s.autoConnect,
      settingsLoaded: s.loaded,
      loadSettings: s.load,
    })),
  )

  const connection = useBoardConnection()
  const { bleStatus, handleRetryConnect } = connection

  useBleAppLifecycle()

  useEffect(() => {
    void load()
    void loadSettings()
  }, [load, loadSettings])

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (permStatus === 'granted') {
      startGpsTracking()
    }
  }, [permStatus, startGpsTracking])

  useEffect(() => {
    if (!activeBoardId) {
      autoConnectAttemptedBoardRef.current = null
      return
    }
    if (!autoConnect) {
      autoConnectAttemptedBoardRef.current = null
      return
    }
    if (!boardsLoaded || !settingsLoaded || !connection.nativeStateReady) return
    if (permStatus !== 'granted') return
    if (autoConnectAttemptedBoardRef.current === activeBoardId) return
    if (bleStatus !== 'idle' && bleStatus !== 'error') return

    autoConnectAttemptedBoardRef.current = activeBoardId
    handleRetryConnect()
  }, [
    activeBoardId,
    autoConnect,
    bleStatus,
    boardsLoaded,
    connection.nativeStateReady,
    handleRetryConnect,
    permStatus,
    settingsLoaded,
  ])

  return (
    <View style={styles.container}>
      <CenterScreen
        activeBoard={connection.activeBoard}
        activeBoardId={connection.activeBoardId}
        boards={connection.boards}
        boardsLoaded={boardsLoaded}
        bleStatus={connection.bleStatus}
        recordDebugSession={connection.recordDebugSession}
        onStopScan={connection.handleCancel}
        onRetryConnect={connection.handleRetryConnect}
        onSelectBoard={connection.handleSelectBoard}
        onAddBoard={connection.handleAddBoard}
        onToggleRecordDebug={() => connection.setRecordDebugSession(!connection.recordDebugSession)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.surfaceDeep,
  },
})

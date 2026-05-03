import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { PencilSimpleIcon, PowerIcon, StarIcon, TrashIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/ble/usePermissions'
import { routes } from '@/navigation/routes'
import type { BoardMenuItem } from '@/components/BoardMenu'
import type { RecordingInfo } from '@/store/bleStore'

export function useBoardConnection() {
  const { boards, activeBoardId, setActiveBoard, starBoard } = useBoardStore(
    useShallow((s) => ({
      boards: s.boards,
      activeBoardId: s.activeBoardId,
      setActiveBoard: s.setActiveBoard,
      starBoard: s.starBoard,
    })),
  )
  const {
    status: bleStatus,
    sessionMode,
    recordings,
    connectedId,
    recordDebugSession,
    loadRecordings,
    stopScan,
    connect,
    disconnect,
    replayRecording,
    deleteRecording,
    setRecordDebugSession,
  } = useBleStore(
    useShallow((s) => ({
      status: s.status,
      sessionMode: s.sessionMode,
      recordings: s.recordings,
      connectedId: s.connectedId,
      recordDebugSession: s.recordDebugSession,
      loadRecordings: s.loadRecordings,
      stopScan: s.stopScan,
      connect: s.connect,
      disconnect: s.disconnect,
      replayRecording: s.replayRecording,
      deleteRecording: s.deleteRecording,
      setRecordDebugSession: s.setRecordDebugSession,
    })),
  )
  const { status: permStatus } = usePermissions()
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true)

  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const activeReplay =
    sessionMode === 'replay' && connectedId
      ? recordings.find((r) => r.path === connectedId)
      : undefined
  const replayBoardName = activeReplay
    ? `${activeReplay.deviceName} (${new Date(activeReplay.startedAt).toLocaleString()})`
    : null

  // Native owns scan/connect/reconnect for saved boards.
  useEffect(() => {
    if (!autoConnectEnabled) return
    if (permStatus !== 'granted') return
    if (!activeBoard?.bleId) return
    if (bleStatus !== 'idle' && bleStatus !== 'error') return
    void connect(activeBoard.bleId, activeBoard.name)
  }, [autoConnectEnabled, permStatus, activeBoard?.bleId, activeBoard?.name, bleStatus, connect])

  // Reset on board change or unmount
  useEffect(() => {
    setAutoConnectEnabled(true)
    return () => {
      stopScan()
      void disconnect()
    }
  }, [activeBoardId, disconnect, stopScan])

  useEffect(() => {
    void loadRecordings()
  }, [loadRecordings])

  const menuItems = useMemo<BoardMenuItem[]>(() => {
    const items: BoardMenuItem[] = []
    if (activeBoard && !activeReplay) {
      items.push({
        label: 'Edit Board',
        icon: PencilSimpleIcon,
        onPress: () =>
          router.push({ pathname: routes.addBoardDetails, params: { boardId: activeBoard.id } }),
      })
    }
    if (activeBoard && !activeBoard.isStarred && !activeReplay) {
      items.push({
        label: 'Make main',
        icon: StarIcon,
        onPress: () => starBoard(activeBoard.id),
      })
    }
    if (bleStatus === 'connected' || bleStatus === 'connecting' || bleStatus === 'reconnecting') {
      items.push({
        label: activeReplay ? 'Stop' : 'Disconnect',
        icon: PowerIcon,
        onPress: () => {
          setAutoConnectEnabled(false)
          void disconnect()
        },
      })
      if (activeReplay) {
        items.push({
          label: 'Remove recording',
          icon: TrashIcon,
          destructive: true,
          onPress: () =>
            Alert.alert(
              'Remove Recording',
              `Remove "${activeReplay.fileName}"? This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => {
                    void disconnect().then(() => deleteRecording(activeReplay))
                  },
                },
              ],
            ),
        })
      }
    }
    return items
  }, [activeBoard, activeReplay, bleStatus, deleteRecording, disconnect, starBoard])

  const handleSelectBoard = useCallback((id: string) => setActiveBoard(id), [setActiveBoard])

  const handleAddBoard = useCallback(() => {
    router.push(routes.addBoardScan)
  }, [])

  const handleReplay = useCallback(
    (recording: RecordingInfo) => {
      setAutoConnectEnabled(false)
      void replayRecording(recording)
    },
    [replayRecording],
  )

  const handleStopScan = useCallback(() => {
    setAutoConnectEnabled(false)
    void disconnect()
  }, [disconnect])

  const handleRetryConnect = useCallback(() => {
    if (!activeBoard?.bleId) return
    setAutoConnectEnabled(true)
    void connect(activeBoard.bleId, activeBoard.name)
  }, [activeBoard?.bleId, activeBoard?.name, connect])

  return {
    boards,
    activeBoard,
    activeBoardId,
    replayBoardName,
    bleStatus,
    recordings,
    recordDebugSession,
    menuItems,
    handleSelectBoard,
    handleAddBoard,
    handleReplay,
    handleStopScan,
    handleRetryConnect,
    setRecordDebugSession,
  }
}

import { useCallback } from 'react'
import { router } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { routes } from '@/navigation/routes'
import { boardNeedsLink } from '@/lib/boardTransport'

function isBoardBusy(status: string): boolean {
  return (
    status === 'connecting' ||
    status === 'discovering' ||
    status === 'subscribing' ||
    status === 'connected' ||
    status === 'stale' ||
    status === 'waiting_for_telemetry' ||
    status === 'reconnecting' ||
    status === 'rescanning' ||
    status === 'disconnecting'
  )
}

export function useBoardConnection() {
  const { boards, activeBoardId, setActiveBoard } = useBoardStore(
    useShallow((s) => ({
      boards: s.boards,
      activeBoardId: s.activeBoardId,
      setActiveBoard: s.setActiveBoard,
    })),
  )
  const {
    status: bleStatus,
    nativeStateReady,
    recordDebugSession,
    stopScan,
    connect,
    disconnect,
    setSelectedBoard,
    setRecordDebugSession,
  } = useBleStore(
    useShallow((s) => ({
      status: s.status,
      nativeStateReady: s.nativeStateReady,
      recordDebugSession: s.recordDebugSession,
      stopScan: s.stopScan,
      connect: s.connect,
      disconnect: s.disconnect,
      setSelectedBoard: s.setSelectedBoard,
      setRecordDebugSession: s.setRecordDebugSession,
    })),
  )

  const activeBoard = boards.find((b) => b.id === activeBoardId)

  const handleSelectBoard = useCallback(
    (id: string) => {
      setActiveBoard(id)
      setSelectedBoard(id)
    },
    [setActiveBoard, setSelectedBoard],
  )

  const handleAddBoard = useCallback(() => {
    router.push(routes.addBoard)
  }, [])

  const handleCancel = useCallback(() => {
    const { status } = useBleStore.getState()
    if (isBoardBusy(status)) {
      void disconnect()
    } else {
      stopScan()
    }
  }, [stopScan, disconnect])

  const handleRetryConnect = useCallback(() => {
    if (!activeBoard) return
    // An unlinked Board can't start a Board Session; route to the link/probe flow.
    if (boardNeedsLink(activeBoard)) {
      router.push({ pathname: routes.editBoardLink, params: { boardId: activeBoard.id } })
      return
    }
    const activeBoardId = activeBoard.id
    void connect(activeBoardId)
  }, [activeBoard, connect])

  return {
    boards,
    activeBoard,
    activeBoardId,
    nativeStateReady,
    bleStatus,
    recordDebugSession,
    handleSelectBoard,
    handleAddBoard,
    handleCancel,
    handleRetryConnect,
    setRecordDebugSession,
  }
}

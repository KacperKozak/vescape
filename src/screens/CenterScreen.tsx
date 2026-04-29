import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { router } from 'expo-router'
import { CaretDown, PencilSimple, Power, Star, Trash } from 'phosphor-react-native'

import { useBoardStore } from '@/src/store/boardStore'
import { useBleStore } from '@/src/store/bleStore'
import { usePermissions } from '@/src/ble/usePermissions'
import { BoardMenu, type BoardMenuItem } from '@/src/components/BoardMenu'
import { BoardSelectorSheet } from '@/src/components/BoardSelectorSheet'
import { GpsStatusBadge, StatusPill } from '@/src/components/StatusPill'
import { TelemetryView } from '@/src/components/TelemetryView'
import type { RecordingInfo } from '@/src/store/bleStore'

export function CenterScreen() {
  const { boards, activeBoardId, setActiveBoard, starBoard } = useBoardStore()
  const {
    status: bleStatus,
    sessionMode,
    devices,
    recordings,
    connectedId,
    recordDebugSession,
    loadRecordings,
    startScan,
    stopScan,
    connect,
    disconnect,
    replayRecording,
    deleteRecording,
    setRecordDebugSession,
  } = useBleStore()
  const { status: permStatus, request } = usePermissions()
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [scanEnabled, setScanEnabled] = useState(true)
  const connectingRef = useRef(false)

  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const activeReplay =
    sessionMode === 'replay' && connectedId
      ? recordings.find((r) => r.path === connectedId)
      : undefined
  const replayBoardName = activeReplay
    ? `${activeReplay.deviceName} (${new Date(activeReplay.startedAt).toLocaleString()})`
    : null

  useEffect(() => {
    void request()
  }, [request])

  // Start scanning whenever intent + conditions align.
  // bleStatus in deps restarts after external stopScan calls (e.g. add-board screen),
  // but scanEnabled gates it so manual Stop/Disconnect don't auto-restart.
  useEffect(() => {
    if (!scanEnabled) return
    if (permStatus !== 'granted') return
    if (!activeBoard?.bleId) return
    if (bleStatus !== 'idle') return
    connectingRef.current = false
    startScan()
  }, [scanEnabled, permStatus, activeBoard?.bleId, bleStatus, startScan])

  // Reset intent and clean up when the active board changes or on unmount.
  useEffect(() => {
    setScanEnabled(true)
    connectingRef.current = false
    return () => {
      stopScan()
      void disconnect()
    }
  }, [activeBoardId, disconnect, stopScan])

  // Auto-connect when the active board appears in scan results.
  useEffect(() => {
    if (!activeBoard?.bleId) return
    if (bleStatus !== 'scanning') return
    if (connectingRef.current) return
    const match = devices.find((d) => d.id === activeBoard.bleId)
    if (!match) return
    connectingRef.current = true
    stopScan()
    void connect(match.id, activeBoard.name)
  }, [activeBoard?.bleId, activeBoard?.name, bleStatus, connect, devices, stopScan])

  useEffect(() => {
    void loadRecordings()
  }, [loadRecordings])

  const menuItems = useMemo<BoardMenuItem[]>(() => {
    const items: BoardMenuItem[] = []
    if (activeBoard && !activeReplay) {
      items.push({
        label: 'Edit Board',
        icon: PencilSimple,
        onPress: () =>
          router.push({ pathname: '/add-board/details', params: { boardId: activeBoard.id } }),
      })
    }
    if (activeBoard && !activeBoard.isStarred && !activeReplay) {
      items.push({
        label: 'Make main',
        icon: Star,
        onPress: () => starBoard(activeBoard.id),
      })
    }
    if (bleStatus === 'connected' || bleStatus === 'connecting') {
      items.push({
        label: activeReplay ? 'Stop' : 'Disconnect',
        icon: Power,
        onPress: () => {
          setScanEnabled(false)
          void disconnect()
        },
      })
      if (activeReplay) {
        items.push({
          label: 'Remove recording',
          icon: Trash,
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

  const handleReplay = (recording: RecordingInfo) => {
    setScanEnabled(false)
    void replayRecording(recording)
  }

  return (
    <View style={styles.container}>
      <View style={styles.selectorBar}>
        <TouchableOpacity style={styles.selector} onPress={() => setSelectorOpen(true)}>
          <Text style={styles.selectorText} numberOfLines={1}>
            {replayBoardName ?? activeBoard?.name ?? 'No board selected'}
          </Text>
          <CaretDown size={14} color="#9ca3af" weight="bold" />
        </TouchableOpacity>
        <GpsStatusBadge />
        <StatusPill status={bleStatus} />
        <BoardMenu items={menuItems} />
      </View>

      {activeBoard?.bleId || bleStatus === 'connected' || bleStatus === 'connecting' ? (
        <View style={styles.telemetryShell}>
          {activeBoard && bleStatus === 'scanning' && (
            <View style={styles.connectionBar}>
              <Text style={styles.connectionText}>Searching for {activeBoard.name}</Text>
              <TouchableOpacity
                style={styles.connectionButton}
                onPress={() => {
                  setScanEnabled(false)
                  stopScan()
                }}
              >
                <Text style={styles.connectionButtonText}>Stop</Text>
              </TouchableOpacity>
            </View>
          )}
          {activeBoard && bleStatus === 'idle' && activeBoard.bleId && (
            <View style={styles.connectionBar}>
              <Text style={styles.connectionText}>Board not connected</Text>
              <TouchableOpacity
                style={styles.connectionButton}
                onPress={() => {
                  setScanEnabled(true)
                  startScan()
                }}
              >
                <Text style={styles.connectionButtonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          )}
          {activeBoard && bleStatus === 'error' && activeBoard.bleId && (
            <View style={styles.connectionBar}>
              <Text style={styles.connectionText}>Connection failed</Text>
              <TouchableOpacity
                style={styles.connectionButton}
                onPress={() => {
                  setScanEnabled(true)
                  startScan()
                }}
              >
                <Text style={styles.connectionButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          <TelemetryView />
        </View>
      ) : (
        <View style={styles.body}>
          {activeBoard ? (
            <>
              <Text style={styles.bodyTitle}>{activeBoard.name}</Text>
              <Text style={styles.bodySubtitle}>No device paired</Text>
              <TouchableOpacity
                style={styles.scanStopButton}
                onPress={() =>
                  router.push({
                    pathname: '/add-board/details',
                    params: { boardId: activeBoard.id },
                  })
                }
              >
                <Text style={styles.scanStopText}>Open Settings</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.bodyTitle}>No board added yet</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/add-board/scan')}
              >
                <Text style={styles.addButtonText}>+ Add your first board</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <BoardSelectorSheet
        visible={selectorOpen}
        boards={boards}
        activeBoardId={activeBoardId}
        recordings={recordings}
        recordDebugSession={recordDebugSession}
        onClose={() => setSelectorOpen(false)}
        onSelectBoard={(id) => {
          setActiveBoard(id)
          setSelectorOpen(false)
        }}
        onAddBoard={() => {
          setSelectorOpen(false)
          router.push('/add-board/scan')
        }}
        onReplay={(recording) => {
          setSelectorOpen(false)
          handleReplay(recording)
        }}
        onToggleRecordDebug={() => setRecordDebugSession(!recordDebugSession)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  selectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    gap: 8,
  },
  selector: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectorText: { flex: 1, color: '#f9fafb', fontSize: 16, fontWeight: '600' },
  telemetryShell: { flex: 1 },
  connectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    gap: 12,
  },
  connectionText: { flex: 1, color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  connectionButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#374151',
  },
  connectionButtonText: { color: '#f9fafb', fontSize: 13, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  bodyTitle: { color: '#9ca3af', fontSize: 16, textAlign: 'center' },
  bodySubtitle: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
  addButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scanStopButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  scanStopText: { color: '#9ca3af', fontWeight: '600', fontSize: 14 },
})

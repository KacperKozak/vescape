import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useBoardStore } from '@/src/store/boardStore'
import { useBleStore } from '@/src/store/bleStore'
import { usePermissions } from '@/src/ble/usePermissions'
import { StatusPill } from '@/src/components/StatusPill'
import { TelemetryView } from '@/src/components/TelemetryView'
import type { RecordingInfo } from '@/src/store/bleStore'

interface MenuItem {
  label: string
  icon: string
  onPress: () => void
  destructive?: boolean
  separator?: boolean
}

function DropdownMenu({
  items,
  anchor,
  onClose,
}: {
  items: MenuItem[]
  anchor: { top: number; right: number }
  onClose: () => void
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dropStyles.menu, { top: anchor.top, right: anchor.right }]}>
        {items.map((item, i) => (
          <View key={item.label}>
            {item.separator && i > 0 && <View style={dropStyles.separator} />}
            <TouchableOpacity
              style={dropStyles.item}
              onPress={() => {
                onClose()
                item.onPress()
              }}
            >
              <Text style={dropStyles.icon}>{item.icon}</Text>
              <Text style={[dropStyles.label, item.destructive && dropStyles.destructive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </Modal>
  )
}

const dropStyles = StyleSheet.create({
  menu: {
    position: 'absolute',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  icon: { fontSize: 16, width: 20, textAlign: 'center' },
  label: { color: '#f9fafb', fontSize: 15 },
  destructive: { color: '#f87171' },
  separator: { height: 1, backgroundColor: '#374151', marginHorizontal: 0 },
})

export function CenterScreen() {
  const { boards, activeBoardId, setActiveBoard, starBoard } = useBoardStore()
  const {
    status: bleStatus,
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
  const insets = useSafeAreaInsets()
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null)
  const [scanEnabled, setScanEnabled] = useState(true)
  const menuButtonRef = useRef<View>(null)
  const connectingRef = useRef(false)

  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const activeReplay = connectedId ? recordings.find((r) => r.path === connectedId) : undefined
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadRecordings()
  }, [])

  const openMenu = () => {
    menuButtonRef.current?.measure((_x, _y, _w, h, _px, pageY) => {
      setMenuAnchor({ top: pageY + h + 4, right: 12 })
    })
  }

  const buildMenuItems = (): MenuItem[] => {
    if (!activeBoard) return []
    const items: MenuItem[] = []
    if (!activeReplay) {
      items.push({
        label: 'Edit Board',
        icon: '✏️',
        onPress: () =>
          router.push({ pathname: '/add-board/details', params: { boardId: activeBoard.id } }),
      })
    }
    if (!activeBoard.isStarred) {
      items.push({
        label: 'Make main',
        icon: '★',
        onPress: () => starBoard(activeBoard.id),
      })
    }
    if (bleStatus === 'connected' || bleStatus === 'connecting') {
      items.push({
        label: activeReplay ? 'Stop' : 'Disconnect',
        icon: '⏻',
        onPress: () => {
          setScanEnabled(false)
          void disconnect()
        },
      })
      if (activeReplay) {
        items.push({
          label: 'Remove recording',
          icon: '🗑',
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
  }

  const handleReplay = (recording: RecordingInfo) => {
    setScanEnabled(false)
    void replayRecording(recording)
  }

  const isConnected = bleStatus === 'connected' || bleStatus === 'connecting'

  return (
    <View style={styles.container}>
      <View style={styles.selectorBar}>
        <TouchableOpacity style={styles.selector} onPress={() => setSelectorOpen(true)}>
          <Text style={styles.selectorText} numberOfLines={1}>
            {replayBoardName ?? activeBoard?.name ?? 'No board selected'}
          </Text>
          <Text style={styles.selectorChevron}>▾</Text>
        </TouchableOpacity>
        <StatusPill status={bleStatus} />
        {activeBoard && (
          <View ref={menuButtonRef} collapsable={false}>
            <TouchableOpacity style={styles.menuButton} onPress={openMenu}>
              <Text style={styles.menuDots}>⋮</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isConnected ? (
        <TelemetryView />
      ) : (
        <View style={styles.body}>
          {activeBoard ? (
            <>
              {bleStatus === 'scanning' ? (
                <>
                  <ActivityIndicator color="#facc15" />
                  <Text style={styles.bodyTitle}>Searching for {activeBoard.name}…</Text>
                  <TouchableOpacity
                    style={styles.scanStopButton}
                    onPress={() => {
                      setScanEnabled(false)
                      stopScan()
                    }}
                  >
                    <Text style={styles.scanStopText}>Stop</Text>
                  </TouchableOpacity>
                </>
              ) : bleStatus === 'error' ? (
                <>
                  <Text style={styles.bodyTitle}>Connection failed</Text>
                  <Text style={styles.bodySubtitle}>
                    Make sure your board is powered on and in range
                  </Text>
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={() => {
                      setScanEnabled(true)
                      startScan()
                    }}
                  >
                    <Text style={styles.scanButtonText}>Connect</Text>
                  </TouchableOpacity>
                </>
              ) : activeBoard.bleId ? (
                <>
                  <Text style={styles.bodyTitle}>{activeBoard.name}</Text>
                  <Text style={styles.bodySubtitle}>Board not connected</Text>
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={() => {
                      setScanEnabled(true)
                      startScan()
                    }}
                  >
                    <Text style={styles.scanButtonText}>Connect</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.bodyTitle}>{activeBoard.name}</Text>
                  <Text style={styles.bodySubtitle}>No device paired — tap ▾ to pair</Text>
                </>
              )}
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

      <Modal
        visible={selectorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectorOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectorOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom || 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Boards</Text>
          <ScrollView bounces={false}>
            {boards.map((board) => (
              <TouchableOpacity
                key={board.id}
                style={styles.boardRow}
                onPress={() => {
                  setActiveBoard(board.id)
                  setSelectorOpen(false)
                }}
              >
                <Text style={styles.boardStar}>{board.isStarred ? '★' : '☆'}</Text>
                <Text
                  style={[styles.boardName, board.id === activeBoardId && styles.boardNameActive]}
                >
                  {board.name}
                </Text>
                {board.id === activeBoardId && <Text style={styles.boardCheck}>✓</Text>}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.addBoardRow}
              onPress={() => {
                setSelectorOpen(false)
                router.push('/add-board/scan')
              }}
            >
              <Text style={styles.addBoardText}>+ Add new board</Text>
            </TouchableOpacity>

            {recordings.length > 0 && (
              <>
                <View style={styles.modalDivider} />
                <Text style={styles.modalSectionTitle}>Recordings</Text>
                {recordings.map((r) => (
                  <TouchableOpacity
                    key={r.path}
                    style={styles.simRow}
                    onPress={() => {
                      setSelectorOpen(false)
                      handleReplay(r)
                    }}
                  >
                    <View style={styles.simInfo}>
                      <Text style={styles.simName}>{r.deviceName}</Text>
                      <Text style={styles.simMeta}>
                        {new Date(r.startedAt).toLocaleString()} · {Math.ceil(r.sizeBytes / 1024)}{' '}
                        KB
                      </Text>
                    </View>
                    <Text style={styles.simChevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <View style={styles.modalDivider} />
            <TouchableOpacity
              style={styles.debugToggleRow}
              onPress={() => setRecordDebugSession(!recordDebugSession)}
            >
              <View style={[styles.checkbox, recordDebugSession && styles.checkboxOn]}>
                {recordDebugSession && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.debugToggleText}>Record next session</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {menuAnchor && (
        <DropdownMenu
          items={buildMenuItems()}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
        />
      )}
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
  selectorChevron: { color: '#6b7280', fontSize: 16 },
  menuButton: { paddingHorizontal: 8, paddingVertical: 4 },
  menuDots: { color: '#9ca3af', fontSize: 22, lineHeight: 22 },
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
  scanButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  scanButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scanStopButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  scanStopText: { color: '#9ca3af', fontWeight: '600', fontSize: 14 },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  debugToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  debugToggleText: { color: '#9ca3af', fontSize: 15 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#4b5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkboxMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  simInfo: { flex: 1 },
  simName: { color: '#f9fafb', fontSize: 14, fontWeight: '600' },
  simMeta: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  simChevron: { color: '#6b7280', fontSize: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: '#1f2937',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4b5563',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalDivider: { height: 1, backgroundColor: '#374151', marginTop: 4 },
  modalSectionTitle: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  boardStar: { color: '#facc15', fontSize: 16 },
  boardName: { flex: 1, color: '#9ca3af', fontSize: 16 },
  boardNameActive: { color: '#f9fafb', fontWeight: '600' },
  boardCheck: { color: '#3b82f6', fontSize: 16, fontWeight: '700' },
  addBoardRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 4,
  },
  addBoardText: { color: '#3b82f6', fontSize: 16, fontWeight: '600' },
})

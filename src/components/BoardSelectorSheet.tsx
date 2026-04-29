import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Board } from '@/db/boards'
import type { RecordingInfo } from '@/store/bleStore'

export function BoardSelectorSheet({
  visible,
  boards,
  activeBoardId,
  recordings,
  recordDebugSession,
  onClose,
  onSelectBoard,
  onAddBoard,
  onReplay,
  onToggleRecordDebug,
}: {
  visible: boolean
  boards: Board[]
  activeBoardId: string | null
  recordings: RecordingInfo[]
  recordDebugSession: boolean
  onClose: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onReplay: (recording: RecordingInfo) => void
  onToggleRecordDebug: () => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={[styles.modalSheet, { paddingBottom: insets.bottom || 16 }]}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Boards</Text>
        <ScrollView bounces={false}>
          {boards.map((board) => (
            <Pressable
              key={board.id}
              style={styles.boardRow}
              onPress={() => onSelectBoard(board.id)}
            >
              <Text style={styles.boardStar}>{board.isStarred ? '★' : '☆'}</Text>
              <Text
                style={[styles.boardName, board.id === activeBoardId && styles.boardNameActive]}
              >
                {board.name}
              </Text>
              {board.id === activeBoardId && <Text style={styles.boardCheck}>✓</Text>}
            </Pressable>
          ))}

          <Pressable style={styles.addBoardRow} onPress={onAddBoard}>
            <Text style={styles.addBoardText}>+ Add new board</Text>
          </Pressable>

          {recordings.length > 0 && (
            <>
              <View style={styles.modalDivider} />
              <Text style={styles.modalSectionTitle}>Recordings</Text>
              {recordings.map((r) => (
                <Pressable key={r.path} style={styles.simRow} onPress={() => onReplay(r)}>
                  <View style={styles.simInfo}>
                    <Text style={styles.simName}>{r.deviceName}</Text>
                    <Text style={styles.simMeta}>
                      {new Date(r.startedAt).toLocaleString()} · {Math.ceil(r.sizeBytes / 1024)} KB
                    </Text>
                  </View>
                  <Text style={styles.simChevron}>›</Text>
                </Pressable>
              ))}
            </>
          )}

          <View style={styles.modalDivider} />
          <Pressable style={styles.debugToggleRow} onPress={onToggleRecordDebug}>
            <View style={[styles.checkbox, recordDebugSession && styles.checkboxOn]}>
              {recordDebugSession && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.debugToggleText}>Record next session</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
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
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  simInfo: { flex: 1 },
  simName: { color: '#f9fafb', fontSize: 14, fontWeight: '600' },
  simMeta: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  simChevron: { color: '#6b7280', fontSize: 20 },
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
})

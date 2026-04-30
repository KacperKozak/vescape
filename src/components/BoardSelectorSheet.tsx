import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CaretRight,
  CheckCircle,
  Lightning,
  Plus,
  Star,
  VideoCamera,
  RadioButton,
  Record,
} from 'phosphor-react-native'

import type { Board } from '@/db/boards'
import type { RecordingInfo } from '@/store/bleStore'
import { theme } from '@/constants/theme'

interface BoardSelectorSheetProps {
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
}

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
}: BoardSelectorSheetProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom || 20 }]}>
        <View style={styles.handle} />

        <Text style={styles.sectionTitle}>Your Boards</Text>
        <ScrollView bounces={false} style={styles.scroll}>
          {boards.map((board) => {
            const isActive = board.id === activeBoardId
            return (
              <Pressable
                key={board.id}
                style={[styles.boardRow, isActive && styles.boardRowActive]}
                onPress={() => onSelectBoard(board.id)}
              >
                <View style={[styles.boardIcon, isActive && styles.boardIconActive]}>
                  <Lightning
                    size={16}
                    color={isActive ? theme.wheel.color : '#6b7280'}
                    weight={isActive ? 'fill' : 'regular'}
                  />
                </View>
                <View style={styles.boardInfo}>
                  <Text style={[styles.boardName, isActive && styles.boardNameActive]}>
                    {board.name}
                  </Text>
                  {board.isStarred && (
                    <View style={styles.starBadge}>
                      <Star size={10} color="#facc15" weight="fill" />
                      <Text style={styles.starText}>Main</Text>
                    </View>
                  )}
                </View>
                {isActive && <CheckCircle size={20} color={theme.wheel.color} weight="fill" />}
              </Pressable>
            )
          })}

          <Pressable style={styles.addRow} onPress={onAddBoard}>
            <View style={styles.addIcon}>
              <Plus size={16} color={theme.wheel.color} weight="bold" />
            </View>
            <Text style={styles.addText}>Add new board</Text>
          </Pressable>

          {recordings.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Recordings</Text>
              {recordings.map((r) => (
                <Pressable key={r.path} style={styles.recordingRow} onPress={() => onReplay(r)}>
                  <View style={styles.recordingIcon}>
                    <VideoCamera size={14} color="#a78bfa" weight="fill" />
                  </View>
                  <View style={styles.recordingInfo}>
                    <Text style={styles.recordingName} numberOfLines={1}>
                      {r.deviceName}
                    </Text>
                    <Text style={styles.recordingMeta}>
                      {new Date(r.startedAt).toLocaleString()} · {Math.ceil(r.sizeBytes / 1024)} KB
                    </Text>
                  </View>
                  <CaretRight size={16} color="#4b5563" weight="bold" />
                </Pressable>
              ))}
            </>
          )}

          <View style={styles.divider} />
          <Pressable style={styles.debugRow} onPress={onToggleRecordDebug}>
            {recordDebugSession ? (
              <Record size={20} color={theme.wheel.color} weight="fill" />
            ) : (
              <RadioButton size={20} color="#4b5563" weight="regular" />
            )}
            <Text style={[styles.debugText, recordDebugSession && styles.debugTextActive]}>
              Record next session
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: '#131c2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  scroll: {
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginHorizontal: 20,
    marginTop: 8,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  boardRowActive: {
    backgroundColor: '#1e293b',
  },
  boardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardIconActive: {
    backgroundColor: theme.wheel.bg,
  },
  boardInfo: {
    flex: 1,
    gap: 2,
  },
  boardName: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  boardNameActive: {
    color: '#f1f5f9',
  },
  starBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starText: {
    color: '#facc15',
    fontSize: 10,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#334155',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: theme.wheel.color,
    fontSize: 15,
    fontWeight: '700',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  recordingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e1338',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 12,
  },
  debugText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  debugTextActive: {
    color: '#94a3b8',
  },
})

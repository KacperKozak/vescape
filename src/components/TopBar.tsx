import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CaretDownIcon } from 'phosphor-react-native'

import { BoardMenu, type BoardMenuItem } from '@/components/BoardMenu'
import { BoardSelectorSheet } from '@/components/BoardSelectorSheet'
import { VibeWheelLogo } from '@/components/VibeWheelLogo'
import type { Board } from '@/db/boards'
import type { RecordingInfo } from '@/store/bleStore'

interface TopBarProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  replayBoardName: string | null
  recordings: RecordingInfo[]
  recordDebugSession: boolean
  menuItems: BoardMenuItem[]
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onReplay: (recording: RecordingInfo) => void
  onToggleRecordDebug: () => void
}

export function TopBar({
  boards,
  activeBoardId,
  activeBoard,
  replayBoardName,
  recordings,
  recordDebugSession,
  menuItems,
  onSelectBoard,
  onAddBoard,
  onReplay,
  onToggleRecordDebug,
}: TopBarProps) {
  const [selectorOpen, setSelectorOpen] = useState(false)

  const displayName = replayBoardName ?? activeBoard?.name ?? 'No board'

  return (
    <View style={styles.container}>
      <VibeWheelLogo size={32} />
      <Pressable style={styles.selector} onPress={() => setSelectorOpen(true)}>
        <View style={styles.selectorContent}>
          <Text style={styles.selectorText} numberOfLines={1}>
            {displayName}
          </Text>
          <CaretDownIcon size={12} color="#6b7280" weight="bold" />
        </View>
      </Pressable>

      <BoardMenu items={menuItems} />

      <BoardSelectorSheet
        visible={selectorOpen}
        boards={boards}
        activeBoardId={activeBoardId}
        recordings={recordings}
        recordDebugSession={recordDebugSession}
        onClose={() => setSelectorOpen(false)}
        onSelectBoard={(id) => {
          onSelectBoard(id)
          setSelectorOpen(false)
        }}
        onAddBoard={() => {
          setSelectorOpen(false)
          onAddBoard()
        }}
        onReplay={(recording) => {
          setSelectorOpen(false)
          onReplay(recording)
        }}
        onToggleRecordDebug={onToggleRecordDebug}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f1729',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 8,
  },
  selector: {
    flex: 1,
    minWidth: 0,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  selectorText: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
})

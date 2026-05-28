import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  CheckCircleIcon,
  LightningIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  RadioButtonIcon,
  RecordIcon,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import { routes } from '@/navigation/routes'

import type { Board } from '@/store/boardStore'
import { interaction, theme } from '@/constants/theme'
import { Dropdown } from './Dropdown'

interface BoardSelectorSheetProps {
  visible: boolean
  triggerRef: React.RefObject<View | null>
  boards: Board[]
  activeBoardId: string | null
  recordDebugSession: boolean
  onClose: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
}

export function BoardSelectorSheet({
  visible,
  triggerRef,
  boards,
  activeBoardId,
  recordDebugSession,
  onClose,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
}: BoardSelectorSheetProps) {
  return (
    <Dropdown
      visible={visible}
      triggerRef={triggerRef}
      onClose={onClose}
      matchTriggerWidth={false}
      minWidth={280}
    >
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Your Boards</Text>

        {boards.map((board) => {
          const isActive = board.id === activeBoardId
          return (
            <Pressable
              key={board.id}
              style={({ pressed }) => [
                styles.boardRow,
                isActive && styles.boardRowActive,
                pressed && styles.boardRowPressed,
              ]}
              onPress={() => onSelectBoard(board.id)}
            >
              <View style={[styles.boardIcon, isActive && styles.boardIconActive]}>
                <LightningIcon
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
                    <StarIcon size={10} color={theme.highlight.color} weight="fill" />
                    <Text style={styles.starText}>Main</Text>
                  </View>
                )}
              </View>
              {isActive && <CheckCircleIcon size={20} color={theme.wheel.color} weight="fill" />}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation()
                  onClose()
                  router.push({ pathname: routes.editBoard, params: { boardId: board.id } })
                }}
                hitSlop={8}
              >
                <PencilSimpleIcon size={15} color="#475569" weight="bold" />
              </Pressable>
            </Pressable>
          )
        })}

        <Pressable
          style={({ pressed }) => [styles.addRow, pressed && styles.boardRowPressed]}
          onPress={onAddBoard}
        >
          <View style={styles.addIcon}>
            <PlusIcon size={16} color={theme.wheel.color} weight="bold" />
          </View>
          <Text style={styles.addText}>Add new board</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.debugRow, pressed && styles.boardRowPressed]}
          onPress={onToggleRecordDebug}
        >
          {recordDebugSession ? (
            <RecordIcon size={20} color={theme.wheel.color} weight="fill" />
          ) : (
            <RadioButtonIcon size={20} color="#4b5563" weight="regular" />
          )}
          <Text style={[styles.debugText, recordDebugSession && styles.debugTextActive]}>
            Record next session
          </Text>
        </Pressable>
      </ScrollView>
    </Dropdown>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: theme.neutral.surface,
    marginHorizontal: 16,
    marginTop: 4,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 10,
  },
  boardRowActive: {
    backgroundColor: theme.neutral.surface,
  },
  boardRowPressed: {
    backgroundColor: interaction.pressedBg,
  },
  boardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.neutral.surface,
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
    color: theme.neutral.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  boardNameActive: {
    color: theme.neutral.textPrimary,
  },
  starBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starText: {
    color: theme.highlight.color,
    fontSize: 10,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 10,
  },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: theme.neutral.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: theme.wheel.color,
    fontSize: 14,
    fontWeight: '700',
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  debugText: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  debugTextActive: {
    color: theme.neutral.textSecondary,
  },
})

import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  CaretDownIcon,
  PencilSimpleIcon,
  PlugsConnectedIcon,
  PlugsIcon,
  XCircleIcon,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BoardSelectorSheet } from '@/components/BoardSelectorSheet'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { theme } from '@/constants/theme'

interface TopBarProps {
  visible: boolean
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  recordDebugSession: boolean
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
  onDisconnect: () => void
  onRetryConnect: () => void
}

export function TopBar({
  visible,
  boards,
  activeBoardId,
  activeBoard,
  bleStatus,
  recordDebugSession,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
  onDisconnect,
  onRetryConnect,
}: TopBarProps) {
  const insets = useSafeAreaInsets()
  const [selectorOpen, setSelectorOpen] = useState(false)
  if (!visible) return null

  const canDisconnect =
    bleStatus === 'connected' ||
    bleStatus === 'stale' ||
    bleStatus === 'reconnecting' ||
    bleStatus === 'waiting_for_telemetry'
  const canRetry = bleStatus === 'idle' || bleStatus === 'error'
  const name = activeBoard?.name ?? 'No board'
  const statusColor =
    bleStatus === 'connected'
      ? theme.gps.color
      : bleStatus === 'error'
        ? theme.error.color
        : '#94a3b8'

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <Pressable style={styles.boardButton} onPress={() => setSelectorOpen(true)}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.boardText} numberOfLines={1}>
            {name}
          </Text>
          <CaretDownIcon size={12} color="#cbd5e1" weight="bold" />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.iconButton}
          disabled={!activeBoard}
          onPress={() => {
            if (!activeBoard) return
            router.push({ pathname: routes.addBoardDetails, params: { boardId: activeBoard.id } })
          }}
        >
          <PencilSimpleIcon size={15} color={activeBoard ? '#e2e8f0' : '#64748b'} weight="bold" />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.iconButton}
          onPress={canDisconnect ? onDisconnect : onRetryConnect}
          disabled={!canDisconnect && !canRetry}
        >
          {canDisconnect ? (
            <PlugsConnectedIcon size={16} color="#fca5a5" weight="bold" />
          ) : canRetry ? (
            <PlugsIcon size={16} color="#facc15" weight="bold" />
          ) : (
            <XCircleIcon size={16} color="#94a3b8" weight="bold" />
          )}
        </Pressable>
      </View>

      <BoardSelectorSheet
        visible={selectorOpen}
        boards={boards}
        activeBoardId={activeBoardId}
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
        onToggleRecordDebug={onToggleRecordDebug}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 12,
    zIndex: 20,
  },
  pill: {
    minHeight: 36,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    overflow: 'hidden',
  },
  boardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 8,
    minHeight: 36,
    maxWidth: 132,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  boardText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    maxWidth: 92,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  iconButton: {
    width: 34,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

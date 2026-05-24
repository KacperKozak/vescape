import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  CaretDownIcon,
  DropIcon,
  GearSixIcon,
  PencilSimpleIcon,
  PowerIcon,
  UserCircleIcon,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BoardSelectorSheet } from '@/components/BoardSelectorSheet'
import { IconButton } from '@/components/IconButton'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useWeatherStore } from '@/store/weatherStore'
import { theme } from '@/constants/theme'

interface TopBarProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  recordDebugSession: boolean
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
  onDisconnect: () => void
  onWeatherPress?: () => void
}

export function TopBar({
  boards,
  activeBoardId,
  activeBoard,
  bleStatus,
  recordDebugSession,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
  onDisconnect,
  onWeatherPress,
}: TopBarProps) {
  const insets = useSafeAreaInsets()
  const pillRef = useRef<View>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)

  const weatherIcon = useWeatherStore((s) => s.icon)
  const weatherTemp = useWeatherStore((s) => s.temperature)
  const weatherPrecip = useWeatherStore((s) => s.precipitationProbability)
  const hasWeather = weatherIcon != null && weatherTemp != null

  const canDisconnect =
    bleStatus === 'connected' ||
    bleStatus === 'stale' ||
    bleStatus === 'reconnecting' ||
    bleStatus === 'waiting_for_telemetry'
  const name = activeBoard?.name ?? 'No board'
  const statusColor =
    bleStatus === 'connected'
      ? theme.gps.color
      : bleStatus === 'error'
        ? theme.error.color
        : '#94a3b8'

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <IconButton
          icon={UserCircleIcon}
          onPress={() => router.push(routes.profile)}
          style={styles.iconLeft}
        />
        <View ref={pillRef} style={styles.pill}>
          <Pressable style={styles.boardButton} onPress={() => setSelectorOpen(true)}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.boardText} numberOfLines={1}>
              {name}
            </Text>
            <CaretDownIcon size={12} color="#cbd5e1" weight="bold" />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={[styles.plugButton, !activeBoard && styles.iconRoundDisabled]}
            disabled={!activeBoard}
            onPress={() => {
              if (!activeBoard) return
              router.push({ pathname: routes.addBoardDetails, params: { boardId: activeBoard.id } })
            }}
          >
            <PencilSimpleIcon size={14} color={activeBoard ? '#e2e8f0' : '#64748b'} weight="bold" />
          </Pressable>
          <View style={styles.divider} />
          {canDisconnect && (
            <Pressable style={styles.plugButton} onPress={onDisconnect}>
              <PowerIcon size={15} color="#fca5a5" weight="bold" />
            </Pressable>
          )}
        </View>
        <IconButton
          icon={GearSixIcon}
          onPress={() => router.push(routes.settings)}
          style={styles.iconRight}
        />
      </View>
      {hasWeather && (
        <Pressable style={styles.weatherRow} onPress={onWeatherPress}>
          {(() => {
            const WeatherIcon = weatherIcon
            return <WeatherIcon size={13} color="#94a3b8" weight="duotone" />
          })()}
          <Text style={styles.weatherText}>{weatherTemp}°</Text>
          {weatherPrecip != null && weatherPrecip > 0 && (
            <>
              <DropIcon size={11} color={theme.wheel.color} weight="duotone" />
              <Text style={styles.weatherPrecip}>{weatherPrecip}%</Text>
            </>
          )}
        </Pressable>
      )}

      <BoardSelectorSheet
        visible={selectorOpen}
        triggerRef={pillRef}
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
    left: 0,
    right: 0,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  iconRoundDisabled: {
    opacity: 0.4,
  },
  iconRight: {
    position: 'absolute',
    right: 10,
  },
  iconLeft: {
    position: 'absolute',
    left: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderRadius: 19,
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
    minHeight: 38,
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
    maxWidth: 120,
    flexShrink: 1,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  plugButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  weatherText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  weatherPrecip: {
    color: theme.wheel.color,
    fontSize: 11,
    fontWeight: '600',
  },
})

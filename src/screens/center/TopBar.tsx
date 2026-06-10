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

import { BoardSelectorSheet } from '@/components/domain/board/BoardSelectorSheet'
import { IconButton } from '@/components/ui/base/IconButton'
import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import { isNightAtTime } from '@/lib/weather'
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

  const weatherCode = useWeatherStore((s) => s.weatherCode)
  const weatherTemp = useWeatherStore((s) => s.temperature)
  const weatherPrecip = useWeatherStore((s) => s.precipitationProbability)
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)
  const hasWeather = weatherCode != null && weatherTemp != null
  const now = new Date()
  const isNight = isNightAtTime(now.getHours(), now.getMinutes(), sunrise, sunset)

  const canDisconnect =
    bleStatus === 'connected' ||
    bleStatus === 'stale' ||
    bleStatus === 'reconnecting' ||
    bleStatus === 'rescanning' ||
    bleStatus === 'waiting_for_telemetry'
  const name = activeBoard?.name ?? 'No board'
  const statusColor =
    bleStatus === 'connected'
      ? theme.gps.color
      : bleStatus === 'error'
        ? theme.error.color
        : theme.neutral.textSecondary

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <IconButton
          icon={UserCircleIcon}
          onPress={() => router.push(routes.profile)}
          style={styles.iconLeft}
        />
        <View ref={pillRef} style={styles.pill}>
          <Pressable
            style={styles.boardButton}
            onPress={() => setSelectorOpen(true)}
            testID="board-selector-trigger"
            accessibilityLabel="Board selector"
          >
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.boardText} numberOfLines={1}>
              {name}
            </Text>
            <CaretDownIcon size={12} color={theme.neutral.textSecondary} weight="bold" />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={[styles.plugButton, !activeBoard && styles.iconRoundDisabled]}
            disabled={!activeBoard}
            onPress={() => {
              if (!activeBoard) return
              router.push({ pathname: routes.editBoard, params: { boardId: activeBoard.id } })
            }}
            testID="board-edit-button"
          >
            <PencilSimpleIcon
              size={14}
              color={activeBoard ? theme.neutral.textPrimary : theme.neutral.textMuted}
              weight="bold"
            />
          </Pressable>
          <View style={styles.divider} />
          {canDisconnect && (
            <Pressable
              style={styles.plugButton}
              onPress={onDisconnect}
              testID="board-disconnect-button"
            >
              <PowerIcon size={15} color={theme.error.color} weight="bold" />
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
          <WeatherIcon
            code={weatherCode}
            hour={now.getHours()}
            isNight={isNight}
            size={13}
            color={theme.neutral.textSecondary}
            weight="duotone"
          />
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
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
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
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    maxWidth: 120,
    flexShrink: 1,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: theme.neutral.border,
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
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  weatherPrecip: {
    color: theme.wheel.color,
    fontSize: 11,
    fontWeight: '600',
  },
})

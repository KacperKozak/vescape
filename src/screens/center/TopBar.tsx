import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  BroadcastIcon,
  CaretDownIcon,
  GearSixIcon,
  PencilSimpleIcon,
  PowerIcon,
  UsersThreeIcon,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BoardSelectorSheet } from '@/components/domain/board/BoardSelectorSheet'
import { CornerSheet } from '@/components/ui/overlays/AnchoredSheet'
import { IconButton } from '@/components/ui/base/IconButton'
import { WeatherStat } from '@/components/ui/weather/WeatherStat'
import { SocialSheet } from '@/screens/social/SocialSheet'
import { isNightAtTime } from '@/lib/weather'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useGroupRideStore } from '@/store/groupRideStore'
import { useWeatherStore } from '@/store/weatherStore'
import { theme } from '@/constants/theme'

interface TopBarProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onDisconnect: () => void
  onWeatherPress?: () => void
}

export function TopBar({
  boards,
  activeBoardId,
  activeBoard,
  bleStatus,
  onSelectBoard,
  onAddBoard,
  onDisconnect,
  onWeatherPress,
}: TopBarProps) {
  const insets = useSafeAreaInsets()
  const pillRef = useRef<View>(null)
  const socialRef = useRef<View>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [socialOpen, setSocialOpen] = useState(false)

  const nearbyBadge = useGroupRideStore((s) => s.badge)
  const rideActive = useGroupRideStore((s) => s.activeRideId !== null)
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
      ? theme.palette.green.color
      : bleStatus === 'error'
        ? theme.status.error.color
        : theme.palette.slate.textSecondary

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <View ref={socialRef} collapsable={false} style={styles.iconLeft}>
          <IconButton
            icon={rideActive ? BroadcastIcon : UsersThreeIcon}
            onPress={() => setSocialOpen(true)}
            accessibilityLabel="Social"
            dot={nearbyBadge && !rideActive ? theme.palette.groupRide.color : undefined}
            accent={rideActive ? theme.palette.groupRide.color : undefined}
          />
        </View>
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
            <CaretDownIcon size={12} color={theme.palette.slate.textSecondary} weight="bold" />
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
              color={activeBoard ? theme.palette.slate.textPrimary : theme.palette.slate.textMuted}
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
              <PowerIcon size={15} color={theme.status.error.color} weight="bold" />
            </Pressable>
          )}
        </View>
        <IconButton
          icon={GearSixIcon}
          onPress={() => router.push(routes.settings)}
          onLongPress={() => router.push(routes.settingsComponents)}
          style={styles.iconRight}
        />
      </View>
      {hasWeather && (
        <Pressable style={styles.weatherRow} onPress={onWeatherPress}>
          <WeatherStat
            code={weatherCode!}
            temperature={weatherTemp!}
            hour={now.getHours()}
            isNight={isNight}
            precipProbability={weatherPrecip}
            size="sm"
          />
        </Pressable>
      )}

      <CornerSheet
        visible={socialOpen}
        triggerRef={socialRef}
        anchor="left"
        title="Social"
        icon={UsersThreeIcon}
        onClose={() => setSocialOpen(false)}
      >
        <SocialSheet onNavigate={() => setSocialOpen(false)} />
      </CornerSheet>

      <BoardSelectorSheet
        visible={selectorOpen}
        triggerRef={pillRef}
        boards={boards}
        activeBoardId={activeBoardId}
        activeBoardLive={bleStatus === 'connected' || bleStatus === 'stale'}
        onClose={() => setSelectorOpen(false)}
        onSelectBoard={(id) => {
          onSelectBoard(id)
          setSelectorOpen(false)
        }}
        onAddBoard={() => {
          setSelectorOpen(false)
          onAddBoard()
        }}
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
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surfaceDeep,
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
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    maxWidth: 120,
    flexShrink: 1,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: theme.palette.slate.border,
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
    marginTop: 4,
  },
})

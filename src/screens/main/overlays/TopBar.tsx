import { forwardRef, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/base/Text'
import {
  ArrowFatLinesUpIcon,
  BroadcastIcon,
  CaretDownIcon,
  GearSixIcon,
  PencilSimpleIcon,
  PowerIcon,
  UsersThreeIcon,
} from 'phosphor-react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BoardSelectorSheet } from '@/modules/board/components/BoardSelectorSheet'
import { EdgeDrawer } from '@/components/overlays/AnchoredSheet'
import { IconButton } from '@/components/base/IconButton'
import { WeatherStat } from '@/modules/weather/components/WeatherStat'
import { SocialSheet } from '@/modules/group-ride/components/SocialSheet'
import { AccountWidget } from '@/modules/profile/components/AccountWidget'
import { BoardWarningControl } from '@/modules/board/components/BoardWarningControl'
import { ReplayBadge } from '@/modules/board/components/ReplayBadge'
import { useBleStore } from '@/modules/board/store/bleStore'
import { isReplayBoardId } from 'vescape-core'
import { isNightAtTime } from '@/modules/weather/lib/weather'
import { routes } from '@/navigation/routes'
import { showDevControls } from '@/config/env'
import type { Board } from '@/modules/board/store/boardStore'
import { useGroupRideStore } from '@/modules/group-ride/store/groupRideStore'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'
import { theme } from '@/constants/theme'
import { selectAvailableUpdate } from '@/modules/release/lib/availableUpdate'
import { useAppStatusStore } from '@/modules/release/store/appStatusStore'

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

interface BoardPillProps {
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  isReplay: boolean
  onOpenSelector: () => void
  onDisconnect: () => void
}

/** The board identity pill: selector, edit, disconnect and the Board Warning control. */
const BoardPill = forwardRef<View, BoardPillProps>(function BoardPill(
  { activeBoardId, activeBoard, bleStatus, isReplay, onOpenSelector, onDisconnect },
  ref,
) {
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
    <View ref={ref} style={styles.pill}>
      <Pressable
        style={styles.boardButton}
        onPress={onOpenSelector}
        testID="board-selector-trigger"
        accessibilityLabel="Board selector"
      >
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        {isReplay && showDevControls && <ReplayBadge />}
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
      {canDisconnect && (
        <>
          <View style={styles.divider} />
          <Pressable
            style={styles.plugButton}
            onPress={onDisconnect}
            testID="board-disconnect-button"
          >
            <PowerIcon size={15} color={theme.status.error.color} weight="bold" />
          </Pressable>
        </>
      )}
      {activeBoardId && <BoardWarningControl boardId={activeBoardId} />}
    </View>
  )
})

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

  const isReplay = useBleStore((s) => isReplayBoardId(s.connectedId))
  const nearbyBadge = useGroupRideStore((s) => s.badge)
  const rideActive = useGroupRideStore((s) => s.activeRideId !== null)
  const weatherCode = useWeatherStore((s) => s.weatherCode)
  const weatherTemp = useWeatherStore((s) => s.temperature)
  const weatherPrecip = useWeatherStore((s) => s.precipitationProbability)
  const appStatus = useAppStatusStore((s) => s.status)
  const availableUpdate = selectAvailableUpdate(appStatus)
  // A Release Policy warning escalates the gear itself; a merely newer version stays a quiet dot.
  const versionWarning =
    appStatus?.version.status === 'update-warning' || appStatus?.version.status === 'online-blocked'
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)
  const hasWeather = weatherCode != null && weatherTemp != null
  const now = new Date()
  const isNight = isNightAtTime(now.getHours(), now.getMinutes(), sunrise, sunset)

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <View ref={socialRef} collapsable={false} style={styles.iconLeft}>
          <IconButton
            icon={rideActive ? BroadcastIcon : UsersThreeIcon}
            onPress={() => setSocialOpen(true)}
            accessibilityLabel="Social"
            testID="social-drawer-trigger"
            dot={nearbyBadge && !rideActive ? theme.palette.groupRide.color : undefined}
            accent={rideActive ? theme.palette.groupRide.color : undefined}
          />
        </View>
        <BoardPill
          ref={pillRef}
          activeBoardId={activeBoardId}
          activeBoard={activeBoard}
          bleStatus={bleStatus}
          isReplay={isReplay}
          onOpenSelector={() => setSelectorOpen(true)}
          onDisconnect={onDisconnect}
        />
        {/* An Update Warning / Online Block takes over the gear's icon and accent — same treatment
            as an active group ride; a plain available update only badges it with a dot. Settings
            stays this button's one destination, and the update is started from the pill inside. */}
        <IconButton
          icon={versionWarning ? ArrowFatLinesUpIcon : GearSixIcon}
          onPress={() => router.push(routes.settings)}
          onLongPress={() => router.push(routes.settingsComponents)}
          accent={versionWarning ? theme.status.upgrade.color : undefined}
          dot={!versionWarning && availableUpdate ? theme.status.upgrade.color : undefined}
          accessibilityLabel={availableUpdate ? 'Settings, update available' : 'Settings'}
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

      <EdgeDrawer
        visible={socialOpen}
        triggerRef={socialRef}
        title="Social"
        icon={UsersThreeIcon}
        backdropTestID="social-drawer-backdrop"
        onClose={() => setSocialOpen(false)}
      >
        <SocialSheet
          accountWidget={<AccountWidget onNavigate={() => setSocialOpen(false)} />}
          onNavigate={() => setSocialOpen(false)}
        />
      </EdgeDrawer>

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

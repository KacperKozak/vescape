import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  ClockCounterClockwiseIcon,
  FunnelIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'phosphor-react-native'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MapPointKind } from 'vesc-ble'

import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { FloatingBar } from '@/components/domain/main/FloatingBar'
import { HistorySessionSheet } from '@/components/domain/history/HistorySessionSheet'
import { IconButton } from '@/components/ui/base/IconButton'
import { MapNavigationSelector } from '@/components/ui/menus/MapNavigationSelector'
import { MapStyleSwitch } from '@/components/ui/menus/MapStyleSwitch'
import type { MapNavigationMode, MapStyleKey } from '@/constants/mapStyles'
import { getMapPointKindIcon } from '@/constants/mapPointIcons'
import {
  FILTERABLE_MAP_POINT_KIND_OPTIONS,
  getMapPointKindColor,
  getMapPointKindTextColor,
  MAP_POINT_KIND_OPTIONS,
} from '@/constants/mapPoints'
import { theme } from '@/constants/theme'
import type { HistoryMetricKey } from '@/lib/history/metricColorScale'
import { routes } from '@/navigation/routes'
import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import {
  OffscreenMapIndicator,
  type CenterMapHandle,
  type OffscreenMapIndicatorState,
} from '@/screens/center/CenterMap'
import type { MapSelector } from '@/screens/center/centerScreenStore'
import type { CenterViewState } from '@/screens/center/centerViewState'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { WeatherHourlyStrip } from '@/screens/center/WeatherHourlyStrip'
import { WeatherPill } from '@/screens/center/WeatherPill'
import { HistoryStatsBar } from '@/screens/center/HistoryStatsBar'
import { HistoryTelemetryPanel } from '@/screens/center/HistoryTelemetryPanel'
import { LiveHud } from '@/screens/center/LiveHud'
import { MapRevealGesture } from '@/screens/center/MapRevealGesture'
import { MapVignette } from '@/screens/center/MapVignette'
import { TopBar } from '@/screens/center/TopBar'
import type { Board } from '@/store/boardStore'
import type { HistorySession, TelemetryMinuteBucket, TelemetrySample } from '@/store/historyStore'
import { useWeatherStore } from '@/store/weatherStore'

interface CenterBoardOverlayProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  recordDebugSession: boolean
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
}

interface CenterMapOverlayProps {
  heading: number
  mapStyleKey: MapStyleKey
  setMapStyleKey: (key: MapStyleKey) => void
  mapNavigationMode: MapNavigationMode
  setMapNavigationMode: (mode: MapNavigationMode) => void
  mapSelector: MapSelector
  setMapSelector: (selector: MapSelector) => void
  enterMapFocus: () => void
  exitMapFocus: () => void
  enterWeather: () => void
  exitWeather: () => void
  refreshWeather: () => void
  weatherLocation: { latitude: number; longitude: number } | null
  addMapPoint: (kind: MapPointKind, latitude: number, longitude: number) => Promise<unknown>
  hiddenMapPointKinds: MapPointKind[]
  toggleMapPointKindVisibility: (kind: MapPointKind) => void
  offscreenMapIndicators: OffscreenMapIndicatorState[]
  onOffscreenIndicatorPress: (indicator: OffscreenMapIndicatorState) => void
}

interface CenterHistoryOverlayProps {
  enterHistoryMode: () => void
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
  previousRide: HistorySession | null
  nextRide: HistorySession | null
  canPreviousRide: boolean
  loadingSession: boolean
  historyLoading: boolean
  historyHasMore: boolean
  historyError: string | undefined
  blocks: TelemetryMinuteBucket[]
  sessions: HistorySession[]
  historySheetVisible: boolean
  setHistorySheetVisible: (visible: boolean) => void
  selectSession: (session: HistorySession | null) => Promise<void>
  loadMoreHistory: () => Promise<void>
  selectPreviousRide: () => Promise<void>
  selectNextRide: () => Promise<void>
  selectRide: (session: HistorySession) => void
  exitHistory: () => void
  removeSession: () => void
  onSeek: (timeMs: number) => void
  setActiveHistoryMapMetric: (metric: HistoryMetricKey) => void
}

interface CenterOverlaysProps {
  mode: CenterViewState
  mapRef: RefObject<CenterMapHandle | null>
  board: CenterBoardOverlayProps
  map: CenterMapOverlayProps
  history: CenterHistoryOverlayProps
}

const RECORD_BUTTON_HEIGHT = 48
const HISTORY_BUTTON_SIZE = 54
const TELEMETRY_FADE_TIMING = { duration: 260 } as const
const COMPACT_MAP_POINT_KINDS: readonly MapPointKind[] = ['drop', 'bonk', 'nose_slide']

function isCompactMapPointKind(kind: MapPointKind) {
  return COMPACT_MAP_POINT_KINDS.includes(kind)
}

interface FullMapControlsProps {
  mapRef: RefObject<CenterMapHandle | null>
  map: CenterMapOverlayProps
  top: number
  bottom: number
}

function FullMapControls({ mapRef, map, top, bottom }: FullMapControlsProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)

  const toggleAddMenu = useCallback(() => {
    setFilterMenuOpen(false)
    setAddMenuOpen((open) => !open)
  }, [])

  const toggleFilterMenu = useCallback(() => {
    setAddMenuOpen(false)
    setFilterMenuOpen((open) => !open)
  }, [])

  const handleSelectMapPoint = useCallback(
    async (kind: MapPointKind) => {
      const center = await mapRef.current?.getViewfinderCoordinate()
      if (!center) return
      setAddMenuOpen(false)
      void map.addMapPoint(kind, center.latitude, center.longitude)
    },
    [map, mapRef],
  )
  const compactMapPointOptions = MAP_POINT_KIND_OPTIONS.filter((option) =>
    isCompactMapPointKind(option.kind),
  )
  const stackedMapPointOptions = MAP_POINT_KIND_OPTIONS.filter(
    (option) => !isCompactMapPointKind(option.kind),
  )

  return (
    <>
      {addMenuOpen ? <CenterPlacementPointer /> : null}
      <View pointerEvents="box-none" style={[styles.weatherPillContainer, { top }]}>
        <WeatherPill location={map.weatherLocation} onPress={map.enterWeather} />
      </View>
      <View style={[styles.mapSelectors, { top }]}>
        <MapNavigationSelector
          activeMode={map.mapNavigationMode}
          heading={map.heading}
          expanded={map.mapSelector === 'navigation'}
          onToggle={() =>
            map.setMapSelector(map.mapSelector === 'navigation' ? null : 'navigation')
          }
          onSelect={(nextMode) => {
            if (nextMode === 'northUp') mapRef.current?.resetRotation()
            map.setMapNavigationMode(nextMode)
          }}
        />
        <MapStyleSwitch
          activeKey={map.mapStyleKey}
          expanded={map.mapSelector === 'style'}
          onToggle={() => map.setMapSelector(map.mapSelector === 'style' ? null : 'style')}
          onSelect={map.setMapStyleKey}
        />
      </View>
      <Pressable style={[styles.mapBackAction, { bottom }]} onPress={map.exitMapFocus}>
        <ArrowLeftIcon size={20} color={theme.neutral.textSecondary} weight="bold" />
        <Text style={styles.mapBackLabel}>GO BACK</Text>
      </Pressable>
      <View style={[styles.mapFilterAction, { bottom }]}>
        {filterMenuOpen ? (
          <View style={[styles.mapFilterMenu, styles.mapFilterMenuAttached]}>
            {FILTERABLE_MAP_POINT_KIND_OPTIONS.map((option, index) => {
              const IconComponent = getMapPointKindIcon(option.kind)
              const color = getMapPointKindColor(option.kind)
              const visible = !map.hiddenMapPointKinds.includes(option.kind)
              return (
                <Pressable
                  key={option.kind}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label} visibility`}
                  accessibilityState={{ checked: visible }}
                  style={({ pressed }) => [
                    styles.mapFilterRow,
                    !visible && styles.mapFilterRowHidden,
                    pressed && styles.mapAddRowPressed,
                  ]}
                  onPress={() => map.toggleMapPointKindVisibility(option.kind)}
                >
                  <View style={[styles.mapAddRowIcon, { borderColor: color }]}>
                    <IconComponent
                      size={16}
                      color={getMapPointKindTextColor(option.kind)}
                      weight="duotone"
                    />
                  </View>
                  <Text style={styles.mapFilterRowLabel}>{option.label}</Text>
                  {index < FILTERABLE_MAP_POINT_KIND_OPTIONS.length - 1 ? (
                    <View style={styles.mapFilterRowBorder} />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}
        <IconButton
          icon={FunnelIcon}
          size="lg"
          onPress={toggleFilterMenu}
          style={filterMenuOpen ? styles.mapFilterButtonAttached : undefined}
        />
      </View>
      <View style={[styles.mapAddAction, { bottom }]}>
        {addMenuOpen ? (
          <View style={[styles.mapAddMenu, styles.mapAddMenuAttached]}>
            <View style={styles.mapAddCompactRow}>
              {compactMapPointOptions.map((option, index) => {
                const IconComponent = getMapPointKindIcon(option.kind)
                const color = getMapPointKindColor(option.kind)
                return (
                  <Pressable
                    key={option.kind}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.mapAddCompactItem,
                      pressed && styles.mapAddRowPressed,
                    ]}
                    onPress={() => handleSelectMapPoint(option.kind)}
                  >
                    <View style={[styles.mapAddRowIcon, { borderColor: color }]}>
                      <IconComponent
                        size={16}
                        color={getMapPointKindTextColor(option.kind)}
                        weight="duotone"
                      />
                    </View>
                    {index < compactMapPointOptions.length - 1 ? (
                      <View style={styles.mapAddCompactDivider} />
                    ) : null}
                  </Pressable>
                )
              })}
              <View style={styles.mapAddRowBorder} />
            </View>
            {stackedMapPointOptions.map((option, index) => {
              const IconComponent = getMapPointKindIcon(option.kind)
              const color = getMapPointKindColor(option.kind)
              return (
                <Pressable
                  key={option.kind}
                  style={({ pressed }) => [styles.mapAddRow, pressed && styles.mapAddRowPressed]}
                  onPress={() => handleSelectMapPoint(option.kind)}
                >
                  <Text style={styles.mapAddRowLabel}>{option.label}</Text>
                  <View style={[styles.mapAddRowIcon, { borderColor: color }]}>
                    <IconComponent
                      size={16}
                      color={getMapPointKindTextColor(option.kind)}
                      weight="duotone"
                    />
                  </View>
                  {index < stackedMapPointOptions.length - 1 ? (
                    <View style={styles.mapAddRowBorder} />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}
        <Animated.View>
          <IconButton
            icon={addMenuOpen ? XIcon : PlusIcon}
            size="lg"
            onPress={toggleAddMenu}
            style={addMenuOpen ? styles.mapAddButtonAttached : undefined}
          />
        </Animated.View>
      </View>
    </>
  )
}

function CenterPlacementPointer() {
  return (
    <View pointerEvents="none" style={styles.centerPlacementPointer}>
      <View style={styles.centerPlacementBall} />
      <View style={styles.centerPlacementDot} />
    </View>
  )
}

export function CenterOverlays({ mode, mapRef, board, map, history }: CenterOverlaysProps) {
  const insets = useSafeAreaInsets()
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom * 0.5, 8) + 8
  const historyPanelBottom = Math.max(insets.bottom, 16) + 8
  const [panelHeight, setPanelHeight] = useState(0)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const [revealGestureActive, setRevealGestureActive] = useState(false)
  const revealProgress = useSharedValue(0)
  const dragOpacity = useSharedValue(0)
  const telemetryReturnOpacity = useSharedValue(mode === 'telemetry' ? 1 : 0)
  const weatherLoading = useWeatherStore((s) => s.loading)
  const historyBusy = history.loadingSession || history.historyLoading
  const telemetryInteractive = mode === 'telemetry' && !revealGestureActive
  const interfaceFadeStyle = useAnimatedStyle(
    () => ({
      opacity: telemetryInteractive ? (1 - dragOpacity.value) * telemetryReturnOpacity.value : 0,
    }),
    [telemetryInteractive],
  )

  const handleRemovePress = useCallback(() => {
    setRemoveConfirmVisible(true)
  }, [])

  const handleRemoveConfirm = useCallback(() => {
    setRemoveConfirmVisible(false)
    history.removeSession()
  }, [history])

  const handleRemoveCancel = useCallback(() => {
    setRemoveConfirmVisible(false)
  }, [])

  const handleRevealPan = useCallback(
    (totalX: number, totalY: number, animationDuration?: number) => {
      mapRef.current?.previewPanBy(totalX, totalY, animationDuration)
    },
    [mapRef],
  )

  const handleRevealPanStart = useCallback(() => {
    mapRef.current?.beginPreviewPan()
  }, [mapRef])

  const handleRevealZoomStart = useCallback(() => {
    mapRef.current?.beginPreviewZoom()
  }, [mapRef])

  const handleRevealZoom = useCallback(
    (scale: number) => {
      mapRef.current?.previewZoomBy(scale)
    },
    [mapRef],
  )

  const handleRevealZoomEnd = useCallback(() => {
    mapRef.current?.endPreviewZoom()
  }, [mapRef])

  const handleReveal = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } else if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
    }
    setRevealGestureActive(true)
    map.enterMapFocus()
  }, [map])

  const handleRevealFinish = useCallback(
    (revealed: boolean) => {
      const actuallyRevealed = revealed || mode === 'map'
      if (!actuallyRevealed) {
        mapRef.current?.restorePreviewPan()
      }
      setRevealGestureActive(false)
    },
    [mapRef, mode],
  )

  useEffect(() => {
    if (mode === 'telemetry') {
      revealProgress.value = 0
      dragOpacity.value = withTiming(0, TELEMETRY_FADE_TIMING)
      telemetryReturnOpacity.value = 0
      telemetryReturnOpacity.value = withTiming(1, TELEMETRY_FADE_TIMING)
    } else {
      telemetryReturnOpacity.value = 0
    }
  }, [dragOpacity, mode, revealProgress, telemetryReturnOpacity])

  return (
    <>
      {(mode === 'telemetry' || revealGestureActive) && (
        <MapRevealGesture
          progress={revealProgress}
          dragOpacity={dragOpacity}
          onPanStart={handleRevealPanStart}
          onPan={handleRevealPan}
          onZoomStart={handleRevealZoomStart}
          onZoom={handleRevealZoom}
          onZoomEnd={handleRevealZoomEnd}
          onReveal={handleReveal}
          onFinish={handleRevealFinish}
        />
      )}

      <Animated.View
        pointerEvents={telemetryInteractive ? 'box-none' : 'none'}
        style={[styles.telemetryInterface, interfaceFadeStyle]}
      >
        <LiveHud revealProgress={revealProgress} />
        <BottomTelemetryStrip revealProgress={revealProgress} />
        <TopBar
          boards={board.boards}
          activeBoardId={board.activeBoardId}
          activeBoard={board.activeBoard}
          bleStatus={board.bleStatus}
          recordDebugSession={board.recordDebugSession}
          onSelectBoard={board.onSelectBoard}
          onAddBoard={board.onAddBoard}
          onToggleRecordDebug={board.onToggleRecordDebug}
          onDisconnect={board.onStopScan}
          onWeatherPress={map.enterWeather}
        />
        <FloatingBar
          bleStatus={board.bleStatus}
          activeBoard={board.activeBoard}
          onStopScan={board.onStopScan}
          onRetryConnect={board.onRetryConnect}
          bottomOffset={aboveStripBottom}
        />
        <IconButton
          icon={ClockCounterClockwiseIcon}
          size="lg"
          onPress={() => void history.enterHistoryMode()}
          style={[
            styles.historyButton,
            { bottom: aboveStripBottom - (HISTORY_BUTTON_SIZE - RECORD_BUTTON_HEIGHT) / 2 },
          ]}
        />
        <IconButton
          icon={SlidersHorizontalIcon}
          size="lg"
          onPress={() => router.push(routes.tune)}
          style={[
            styles.tuneButton,
            { bottom: aboveStripBottom - (HISTORY_BUTTON_SIZE - RECORD_BUTTON_HEIGHT) / 2 },
          ]}
        />
      </Animated.View>

      <View
        pointerEvents={telemetryInteractive ? 'box-none' : 'none'}
        style={styles.telemetryOffscreenIndicators}
      >
        {map.offscreenMapIndicators.map((indicator) => (
          <OffscreenMapIndicator
            key={indicator.id}
            indicator={indicator}
            onPress={() => map.onOffscreenIndicatorPress(indicator)}
          />
        ))}
      </View>

      <View
        pointerEvents={mode === 'map' ? 'box-none' : 'none'}
        style={[styles.mapInterface, mode === 'map' ? styles.visible : styles.hidden]}
      >
        {mode === 'map' ? (
          <FullMapControls
            mapRef={mapRef}
            map={map}
            top={Math.max(insets.top, 8)}
            bottom={aboveStripBottom - 112}
          />
        ) : null}
      </View>

      <View
        pointerEvents={mode === 'weather' ? 'box-none' : 'none'}
        style={[styles.weatherInterface, mode === 'weather' ? styles.visible : styles.hidden]}
      >
        <MapVignette mode={mode} idPrefix="weather-map-vignette" />
        <IconButton
          icon={ArrowLeftIcon}
          onPress={map.exitWeather}
          style={[styles.backButton, { top: Math.max(insets.top, 8) }]}
        />
        <IconButton
          icon={ArrowsClockwiseIcon}
          onPress={map.refreshWeather}
          loading={weatherLoading}
          style={[styles.weatherRefreshButton, { top: Math.max(insets.top, 8) }]}
        />
        <View
          pointerEvents="none"
          style={[styles.weatherExpandedPill, { top: Math.max(insets.top, 8) }]}
        >
          <WeatherPill location={map.weatherLocation} expanded onPress={() => undefined} />
        </View>
        <View
          style={[styles.weatherHourlyContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <WeatherHourlyStrip />
        </View>
      </View>

      {mode === 'history' && history.selectedSession && (
        <>
          <MapVignette mode={mode} panelHeight={panelHeight} idPrefix="history-map-vignette" />
          {historyBusy && (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator size="small" color={theme.wheel.color} />
            </View>
          )}
          <HistoryTelemetryPanel
            startAtMs={history.selectedSession.startAtMs}
            endAtMs={history.selectedSession.endAtMs}
            deviceName={history.selectedSession.deviceName}
            samples={history.sessionSamples}
            canPrevious={history.canPreviousRide}
            canNext={!!history.nextRide}
            onPrevious={() => {
              void history.selectPreviousRide()
            }}
            onNext={() => {
              void history.selectNextRide()
            }}
            onOpenList={() => history.setHistorySheetVisible(true)}
            onSeek={history.onSeek}
            onMetricInteraction={history.setActiveHistoryMapMetric}
            onHeightChange={setPanelHeight}
          />
          <HistoryStatsBar session={history.selectedSession} />
          <HistoryControls
            loading={historyBusy}
            canRemove={true}
            onBack={history.exitHistory}
            onRemove={handleRemovePress}
          />
        </>
      )}

      {mode === 'history' && !history.selectedSession && (
        <>
          <MapVignette
            mode={mode}
            panelHeight={panelHeight || 150}
            idPrefix="history-map-vignette-loading"
          />
          {historyBusy && (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator size="small" color={theme.wheel.color} />
            </View>
          )}
          <HistoryTelemetryPanel
            startAtMs={null}
            endAtMs={null}
            deviceName={null}
            samples={[]}
            canPrevious={false}
            canNext={false}
            onPrevious={() => undefined}
            onNext={() => undefined}
            onOpenList={() => history.setHistorySheetVisible(true)}
            onSeek={history.onSeek}
            onMetricInteraction={history.setActiveHistoryMapMetric}
            onHeightChange={setPanelHeight}
          />
          <HistoryStatsBar session={null} />
          <HistoryControls
            loading={historyBusy}
            canRemove={false}
            onBack={history.exitHistory}
            onRemove={() => undefined}
          />
        </>
      )}

      <HistorySessionSheet
        visible={history.historySheetVisible}
        bottomOffset={historyPanelBottom + panelHeight + 8}
        blocks={history.blocks}
        sessions={history.sessions}
        selectedSessionId={history.selectedSession?.id ?? null}
        hasMore={history.historyHasMore}
        loadingMore={history.historyLoading}
        onClose={() => history.setHistorySheetVisible(false)}
        onSelectSession={(session) => {
          history.setHistorySheetVisible(false)
          history.selectRide(session)
        }}
        onLoadMore={() => {
          void history.loadMoreHistory()
        }}
      />

      {mode === 'history' && history.historyError ? (
        <View style={[styles.historyError, { bottom: aboveStripBottom }]}>
          <Text style={styles.historyErrorText} selectable>
            {history.historyError}
          </Text>
        </View>
      ) : null}

      <ConfirmModal
        visible={removeConfirmVisible}
        title="Delete Ride"
        message="This ride and all its telemetry data will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={handleRemoveConfirm}
        onCancel={handleRemoveCancel}
      />
    </>
  )
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 10,
    zIndex: 30,
  },
  weatherPillContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  mapSelectors: {
    position: 'absolute',
    right: 12,
    zIndex: 30,
    alignItems: 'flex-end',
    gap: 8,
  },
  mapBackAction: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 30,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapBackLabel: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  mapAddAction: {
    position: 'absolute',
    right: 12,
    zIndex: 31,
    alignItems: 'flex-end',
    gap: 0,
  },
  mapFilterAction: {
    position: 'absolute',
    left: 12,
    zIndex: 31,
    alignItems: 'flex-start',
    gap: 0,
  },
  mapFilterMenu: {
    minWidth: 178,
    alignItems: 'stretch',
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderWidth: 1,
    borderColor: theme.neutral.borderMuted,
  },
  mapFilterMenuAttached: {
    borderBottomLeftRadius: 5,
  },
  mapFilterButtonAttached: {
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderColor: theme.neutral.borderMuted,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  mapFilterRow: {
    height: 42,
    paddingLeft: 5,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  mapFilterRowHidden: {
    opacity: 0.38,
  },
  mapFilterRowLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  mapFilterRowBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.neutral.borderMuted,
  },
  mapAddMenu: {
    minWidth: 178,
    alignItems: 'stretch',
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderWidth: 1,
    borderColor: theme.neutral.borderMuted,
  },
  mapAddMenuAttached: {
    borderBottomRightRadius: 5,
  },
  mapAddButtonAttached: {
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderColor: theme.neutral.borderMuted,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  mapAddRow: {
    height: 42,
    paddingLeft: 16,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapAddCompactRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  mapAddCompactItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mapAddCompactDivider: {
    position: 'absolute',
    top: 7,
    right: 0,
    bottom: 7,
    width: 1,
    backgroundColor: theme.neutral.borderMuted,
  },
  mapAddRowBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.neutral.borderMuted,
  },
  mapAddRowPressed: {
    opacity: 0.55,
  },
  mapAddRowLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  mapAddRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surfaceDeep,
  },
  centerPlacementPointer: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    zIndex: 29,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -12 }, { translateY: -12 }],
  },
  centerPlacementBall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.neutral.textPrimary,
    backgroundColor: theme.neutral.transparent,
  },
  centerPlacementDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.neutral.textPrimary,
  },
  telemetryInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
  },
  telemetryOffscreenIndicators: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
  },
  mapInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 7,
  },
  weatherInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 8,
  },
  weatherRefreshButton: {
    position: 'absolute',
    right: 10,
    zIndex: 30,
  },
  weatherExpandedPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 29,
  },
  weatherHourlyContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  visible: {
    opacity: 1,
  },
  hidden: {
    opacity: 0,
  },
  historyButton: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
  },
  tuneButton: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
  },
  historyError: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 25,
    borderRadius: 10,
    padding: 10,
    backgroundColor: theme.error.bg,
    borderWidth: 1,
    borderColor: theme.error.bg,
  },
  historyErrorText: {
    color: theme.error.text,
    fontSize: 12,
    fontWeight: '700',
  },
  mapLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.neutral.loadingOverlay,
    borderWidth: 1,
    borderColor: theme.neutral.borderMuted,
    transform: [{ translateX: -17 }, { translateY: -17 }],
  },
})

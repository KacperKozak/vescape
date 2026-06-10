import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'phosphor-react-native'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { FloatingBar } from '@/components/domain/main/FloatingBar'
import { HistorySessionSheet } from '@/components/domain/history/HistorySessionSheet'
import { IconButton } from '@/components/ui/base/IconButton'
import { MapNavigationSelector } from '@/components/ui/menus/MapNavigationSelector'
import { MapStyleSwitch } from '@/components/ui/menus/MapStyleSwitch'
import type { MapNavigationMode, MapStyleKey } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'
import { searchMapResults, type MapSearchResult } from '@/lib/map/search'
import type { HistoryMetricKey } from '@/lib/history/metricColorScale'
import { routes } from '@/navigation/routes'
import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import type { CenterMapHandle } from '@/screens/center/CenterMap'
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
  replaceDirectionPoint: (latitude: number, longitude: number) => Promise<unknown>
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
  mapInteractionRevision: number
  board: CenterBoardOverlayProps
  map: CenterMapOverlayProps
  history: CenterHistoryOverlayProps
}

const RECORD_BUTTON_HEIGHT = 48
const HISTORY_BUTTON_SIZE = 54
const TELEMETRY_FADE_TIMING = { duration: 260 } as const

interface FullMapControlsProps {
  mapRef: RefObject<CenterMapHandle | null>
  map: CenterMapOverlayProps
  mapInteractionRevision: number
  top: number
  bottom: number
}

function FullMapControls({
  mapRef,
  map,
  mapInteractionRevision,
  top,
  bottom,
}: FullMapControlsProps) {
  const [searchOpenedAtRevision, setSearchOpenedAtRevision] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchOpen = searchOpenedAtRevision === mapInteractionRevision

  useEffect(() => {
    const query = searchQuery.trim()
    if (!searchOpen || query.length < 2) {
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setSearchLoading(true)
      void searchMapResults(query, {
        proximity: map.weatherLocation,
        signal: controller.signal,
      })
        .then((results) => {
          setSearchResults(results)
          setSearchLoading(false)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setSearchResults([])
          setSearchError(error instanceof Error ? error.message : 'Mapbox search failed')
          setSearchLoading(false)
        })
    }, 260)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [map.weatherLocation, searchOpen, searchQuery])

  const openSearch = useCallback(() => {
    setSearchOpenedAtRevision(mapInteractionRevision)
  }, [mapInteractionRevision])

  const closeSearch = useCallback(() => {
    setSearchOpenedAtRevision(null)
    setSearchQuery('')
    setSearchResults([])
    setSearchError(null)
    setSearchLoading(false)
  }, [])

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query)
    setSearchError(null)
    setSearchResults([])
    if (query.trim().length < 2) {
      setSearchLoading(false)
    } else {
      setSearchLoading(true)
    }
  }, [])

  const handleSearchSelect = useCallback(
    (result: MapSearchResult) => {
      setSearchOpenedAtRevision(null)
      setSearchQuery(result.title)
      mapRef.current?.focusCoordinate([result.longitude, result.latitude])
      void map.replaceDirectionPoint(result.latitude, result.longitude)
    },
    [map, mapRef],
  )

  const handleSearchSubmit = useCallback(() => {
    const first = searchResults[0]
    if (first) handleSearchSelect(first)
  }, [handleSearchSelect, searchResults])

  const showNoResults =
    !searchLoading && !searchError && searchQuery.trim().length >= 2 && searchResults.length === 0

  return (
    <>
      {searchOpen ? (
        <View style={[styles.mapSearchSheet, { top }]}>
          <View style={styles.mapSearchBar}>
            <MagnifyingGlassIcon size={22} color={theme.neutral.textSecondary} weight="bold" />
            <TextInput
              autoFocus
              selectTextOnFocus
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              onSubmitEditing={handleSearchSubmit}
              placeholder="Address or place"
              placeholderTextColor={theme.neutral.textMuted}
              returnKeyType="search"
              style={styles.mapSearchInput}
            />
            <IconButton icon={XIcon} size="lg" onPress={closeSearch} />
          </View>
          {searchLoading || searchError || showNoResults || searchResults.length > 0 ? (
            <View style={styles.mapSearchResults}>
              {searchLoading ? (
                <View style={styles.mapSearchStatusRow}>
                  <ActivityIndicator size="small" color={theme.wheel.color} />
                  <Text style={styles.mapSearchStatusText}>Searching Mapbox</Text>
                </View>
              ) : null}
              {searchError ? (
                <View style={styles.mapSearchStatusRow}>
                  <Text style={styles.mapSearchErrorText}>{searchError}</Text>
                </View>
              ) : null}
              {showNoResults ? (
                <View style={styles.mapSearchStatusRow}>
                  <Text style={styles.mapSearchStatusText}>No results</Text>
                </View>
              ) : null}
              {searchResults.map((result, index) => (
                <Pressable
                  key={result.id}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.mapSearchResult,
                    pressed && styles.mapSearchResultPressed,
                  ]}
                  onPress={() => handleSearchSelect(result)}
                >
                  <View style={styles.mapSearchResultIcon}>
                    <MapPinIcon size={16} color={theme.gps.text} weight="duotone" />
                  </View>
                  <View style={styles.mapSearchResultText}>
                    <Text style={styles.mapSearchResultTitle} numberOfLines={1}>
                      {result.title}
                    </Text>
                    <Text style={styles.mapSearchResultSubtitle} numberOfLines={1}>
                      {result.subtitle}
                    </Text>
                  </View>
                  {index < searchResults.length - 1 ? (
                    <View style={styles.mapSearchResultBorder} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <IconButton
          icon={MagnifyingGlassIcon}
          size="lg"
          onPress={openSearch}
          style={[styles.mapSearchButton, { top }]}
        />
      )}
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
    </>
  )
}

export function CenterOverlays({
  mode,
  mapRef,
  mapInteractionRevision,
  board,
  map,
  history,
}: CenterOverlaysProps) {
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
        pointerEvents={mode === 'map' ? 'box-none' : 'none'}
        style={[styles.mapInterface, mode === 'map' ? styles.visible : styles.hidden]}
      >
        <FullMapControls
          mapRef={mapRef}
          map={map}
          mapInteractionRevision={mapInteractionRevision}
          top={Math.max(insets.top, 8)}
          bottom={aboveStripBottom - 112}
        />
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
  mapSearchButton: {
    position: 'absolute',
    left: 12,
    zIndex: 32,
  },
  mapSearchSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 36,
    gap: 8,
  },
  mapSearchBar: {
    minHeight: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: theme.neutral.borderMuted,
    backgroundColor: theme.neutral.mapOverlaySelector,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 0,
  },
  mapSearchInput: {
    flex: 1,
    minWidth: 0,
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 10,
  },
  mapSearchResults: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.neutral.borderMuted,
    backgroundColor: theme.neutral.mapOverlaySelector,
  },
  mapSearchStatusRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  mapSearchStatusText: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  mapSearchErrorText: {
    color: theme.error.text,
    fontSize: 12,
    fontWeight: '700',
  },
  mapSearchResult: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 14,
    position: 'relative',
  },
  mapSearchResultPressed: {
    opacity: 0.55,
  },
  mapSearchResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.gps.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surfaceDeep,
  },
  mapSearchResultText: {
    flex: 1,
    minWidth: 0,
  },
  mapSearchResultTitle: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  mapSearchResultSubtitle: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  mapSearchResultBorder: {
    position: 'absolute',
    left: 54,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.neutral.borderMuted,
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
  telemetryInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
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
    backgroundColor: 'rgba(9, 12, 18, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    transform: [{ translateX: -17 }, { translateY: -17 }],
  },
})

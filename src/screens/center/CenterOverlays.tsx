import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeftIcon,
  ClockCounterClockwiseIcon,
  SlidersHorizontalIcon,
} from 'phosphor-react-native'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ConfirmModal } from '@/components/ConfirmModal'
import { FloatingBar } from '@/components/FloatingBar'
import { HistorySessionSheet } from '@/components/history/HistorySessionSheet'
import { IconButton } from '@/components/IconButton'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
import type { MapStyleKey } from '@/constants/mapStyles'
import { routes } from '@/navigation/routes'
import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import type { CenterMapHandle } from '@/screens/center/CenterMap'
import type { CenterViewState } from '@/screens/center/centerViewState'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { HistoryStatsBar } from '@/screens/center/HistoryStatsBar'
import { HistoryTelemetryPanel } from '@/screens/center/HistoryTelemetryPanel'
import { LiveHud } from '@/screens/center/LiveHud'
import { MapRevealGesture } from '@/screens/center/MapRevealGesture'
import { MapVignette } from '@/screens/center/MapVignette'
import { TopBar } from '@/screens/center/TopBar'
import type { Board } from '@/store/boardStore'
import type { HistorySession, TelemetrySample } from '@/store/historyStore'

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
  rotationLocked: boolean
  perspectiveEnabled: boolean
  targetLocation: { latitude: number; longitude: number } | null
  clearTargetLocation: () => void
  mapStyleKey: MapStyleKey
  setMapStyleKey: (key: MapStyleKey) => void
  enterMapFocus: () => void
  setRotationLocked: (updater: (prev: boolean) => boolean) => void
  exitMapFocus: () => void
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

export function CenterOverlays({ mode, mapRef, board, map, history }: CenterOverlaysProps) {
  const insets = useSafeAreaInsets()
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom * 0.5, 8) + 8
  const historyPanelBottom = Math.max(insets.bottom, 16) + 8
  const [panelHeight, setPanelHeight] = useState(0)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const [prevMode, setPrevMode] = useState(mode)
  const [revealGestureActive, setRevealGestureActive] = useState(false)
  const revealProgress = useSharedValue(0)
  const dragOpacity = useSharedValue(0)
  const historyBusy = history.loadingSession || history.historyLoading
  const interfaceFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - dragOpacity.value * 0.88,
  }))

  if (mode !== prevMode) {
    setPrevMode(mode)
    if (mode !== 'history' && panelHeight !== 0) {
      setPanelHeight(0)
    }
  }

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
    if (mode === 'history' && panelHeight > 0) {
      mapRef.current?.setPadding(panelHeight + 12)
    }
  }, [mode, mapRef, panelHeight])

  useEffect(() => {
    if (mode === 'telemetry') {
      revealProgress.value = 0
      dragOpacity.value = 0
    }
  }, [dragOpacity, mode, revealProgress])

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

      {mode === 'telemetry' && (
        <>
          <Animated.View
            pointerEvents="box-none"
            style={[styles.telemetryInterface, interfaceFadeStyle]}
          >
            <MapVignette mode={mode} />
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
        </>
      )}

      {mode === 'map' && (
        <>
          <IconButton
            icon={ArrowLeftIcon}
            onPress={map.exitMapFocus}
            style={[styles.backButton, { top: Math.max(insets.top, 8) }]}
          />
          <MapControls
            heading={map.heading}
            rotationLocked={map.rotationLocked}
            perspectiveEnabled={map.perspectiveEnabled}
            followGps={false}
            showClearTarget={!!map.targetLocation}
            onResetRotation={() => mapRef.current?.resetRotation()}
            onToggleRotationLock={() => map.setRotationLocked((prev) => !prev)}
            onTogglePerspective={() => mapRef.current?.togglePerspective()}
            onRecenter={map.exitMapFocus}
            onClearTarget={map.clearTargetLocation}
          />
          <MapStyleSwitch activeKey={map.mapStyleKey} onSelect={map.setMapStyleKey} />
        </>
      )}

      {mode === 'history' && history.selectedSession && (
        <>
          <MapVignette mode={mode} panelHeight={panelHeight} />
          {historyBusy && (
            <View pointerEvents="none" style={styles.mapLoading}>
              <View style={styles.mapLoadingDim} />
              <ActivityIndicator size="large" color="#38bdf8" />
            </View>
          )}
          <HistoryTelemetryPanel
            startAtMs={history.selectedSession.startAtMs}
            endAtMs={history.selectedSession.endAtMs}
            deviceName={history.selectedSession.deviceName}
            samples={history.sessionSamples}
            loading={history.loadingSession}
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
          {historyBusy && (
            <View pointerEvents="none" style={styles.mapLoading}>
              <View style={styles.mapLoadingDim} />
              <ActivityIndicator size="large" color="#38bdf8" />
            </View>
          )}
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
  telemetryInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
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
    backgroundColor: 'rgba(69, 26, 26, 0.88)',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  historyErrorText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '700',
  },
  mapLoading: {
    ...StyleSheet.absoluteFill,
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLoadingDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.34)',
  },
})

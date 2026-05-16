import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { router } from 'expo-router'
import {
  ArrowLeftIcon,
  ClockCounterClockwiseIcon,
  SlidersHorizontalIcon,
} from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { HistoryTelemetryPanel } from '@/screens/center/HistoryTelemetryPanel'
import { LiveHud } from '@/screens/center/LiveHud'
import { MapVignette } from '@/screens/center/MapVignette'
import { TopBar } from '@/screens/center/TopBar'
import type { CenterMapHandle } from '@/screens/center/CenterMap'
import { ConfirmModal } from '@/components/ConfirmModal'
import { FloatingBar } from '@/components/FloatingBar'
import { HistorySessionSheet } from '@/components/history/HistorySessionSheet'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import type { HistorySession, TelemetrySample } from '@/store/historyStore'
import type { MapStyleKey } from '@/constants/mapStyles'
import type { CenterViewState } from '@/screens/center/centerViewState'

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
  setRotationLocked: (updater: (prev: boolean) => boolean) => void
  exitMapFocus: () => void
}

interface CenterHistoryOverlayProps {
  enterHistoryMode: () => void
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
  previousRide: HistorySession | null
  nextRide: HistorySession | null
  loadingSession: boolean
  historyLoading: boolean
  historyError: string | undefined
  sessions: HistorySession[]
  historySheetVisible: boolean
  setHistorySheetVisible: (visible: boolean) => void
  selectSession: (session: HistorySession | null) => Promise<void>
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
  const [panelHeight, setPanelHeight] = useState(0)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)

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

  useEffect(() => {
    if (mode === 'history' || panelHeight === 0) return
    setPanelHeight(0)
  }, [mode, panelHeight])

  useEffect(() => {
    if (mode === 'history' && panelHeight > 0) {
      mapRef.current?.setPadding(panelHeight + 12)
    }
  }, [mode, mapRef, panelHeight])

  return (
    <>
      {mode === 'telemetry' && (
        <>
          <MapVignette mode={mode} />
          <LiveHud />
          <BottomTelemetryStrip />
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
          <Pressable
            style={[
              styles.quickButton,
              styles.historyButton,
              {
                bottom: aboveStripBottom - (HISTORY_BUTTON_SIZE - RECORD_BUTTON_HEIGHT) / 2,
              },
            ]}
            onPress={() => void history.enterHistoryMode()}
          >
            <ClockCounterClockwiseIcon size={18} color="#f8fafc" weight="bold" />
          </Pressable>
          <Pressable
            style={[
              styles.quickButton,
              styles.tuneButton,
              {
                bottom: aboveStripBottom - (HISTORY_BUTTON_SIZE - RECORD_BUTTON_HEIGHT) / 2,
              },
            ]}
            onPress={() => router.push(routes.tune)}
          >
            <SlidersHorizontalIcon size={18} color="#f8fafc" weight="bold" />
          </Pressable>
        </>
      )}

      {mode === 'map' && (
        <>
          <Pressable
            style={[styles.backButton, { top: Math.max(insets.top, 8) }]}
            onPress={map.exitMapFocus}
          >
            <ArrowLeftIcon size={20} color="#f8fafc" weight="bold" />
          </Pressable>
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
          {history.loadingSession && (
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
            canPrevious={!!history.previousRide}
            canNext={!!history.nextRide}
            onPrevious={() => {
              if (history.previousRide) void history.selectSession(history.previousRide)
            }}
            onNext={() => {
              if (history.nextRide) void history.selectSession(history.nextRide)
            }}
            onOpenList={() => history.setHistorySheetVisible(true)}
            onSeek={history.onSeek}
            onHeightChange={setPanelHeight}
          />
          <HistoryControls
            loading={history.loadingSession || history.historyLoading}
            canRemove={true}
            onBack={history.exitHistory}
            onRemove={handleRemovePress}
          />
        </>
      )}

      {mode === 'history' && !history.selectedSession && !history.loadingSession && (
        <HistoryControls
          loading={false}
          canRemove={false}
          onBack={history.exitHistory}
          onRemove={() => undefined}
        />
      )}

      <HistorySessionSheet
        visible={history.historySheetVisible}
        sessions={history.sessions}
        selectedSessionId={history.selectedSession?.id ?? null}
        onClose={() => history.setHistorySheetVisible(false)}
        onSelectSession={history.selectRide}
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  quickButton: {
    position: 'absolute',
    zIndex: 20,
    width: HISTORY_BUTTON_SIZE,
    height: HISTORY_BUTTON_SIZE,
    borderRadius: HISTORY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  historyButton: {
    right: 12,
  },
  tuneButton: {
    left: 12,
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLoadingDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.34)',
  },
})

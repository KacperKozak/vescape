import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState, type RefObject } from 'react'
import { ArrowLeftIcon, ClockCounterClockwiseIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { HistoryTelemetryPanel } from '@/screens/center/HistoryTelemetryPanel'
import { LiveHud } from '@/screens/center/LiveHud'
import { MapVignette } from '@/screens/center/MapVignette'
import { TopBar } from '@/screens/center/TopBar'
import type { CenterMapHandle } from '@/screens/center/CenterMap'
import { FloatingBar } from '@/components/FloatingBar'
import { HistorySessionSheet } from '@/components/history/HistorySessionSheet'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
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
  onSeek: (timeMs: number) => void
}

interface CenterOverlaysProps {
  mode: CenterViewState
  mapRef: RefObject<CenterMapHandle | null>
  board: CenterBoardOverlayProps
  map: CenterMapOverlayProps
  history: CenterHistoryOverlayProps
}

export function CenterOverlays({ mode, mapRef, board, map, history }: CenterOverlaysProps) {
  const insets = useSafeAreaInsets()
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom, 6) + 8
  const [panelHeight, setPanelHeight] = useState(0)

  useEffect(() => {
    if (mode !== 'history') {
      setPanelHeight(0)
      mapRef.current?.setPadding(0)
    }
  }, [mode, mapRef])

  useEffect(() => {
    if (mode === 'history' && panelHeight > 0) {
      mapRef.current?.setPadding(panelHeight + 12)
    }
  }, [mode, mapRef, panelHeight])

  return (
    <>
      {mode === 'telemetry' && (
        <>
          <MapVignette visible />
          <LiveHud visible />
          <BottomTelemetryStrip visible />
          <TopBar
            visible
            boards={board.boards}
            activeBoardId={board.activeBoardId}
            activeBoard={board.activeBoard}
            bleStatus={board.bleStatus}
            recordDebugSession={board.recordDebugSession}
            onSelectBoard={board.onSelectBoard}
            onAddBoard={board.onAddBoard}
            onToggleRecordDebug={board.onToggleRecordDebug}
            onDisconnect={board.onStopScan}
            onRetryConnect={board.onRetryConnect}
          />
          <FloatingBar
            bleStatus={board.bleStatus}
            activeBoard={board.activeBoard}
            onStopScan={board.onStopScan}
            onRetryConnect={board.onRetryConnect}
            bottomOffset={aboveStripBottom}
          />
          <Pressable
            style={[styles.historyButton, { bottom: aboveStripBottom }]}
            onPress={() => void history.enterHistoryMode()}
          >
            <ClockCounterClockwiseIcon size={18} color="#f8fafc" weight="bold" />
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
          <MapVignette visible mode="history" panelHeight={panelHeight} />
          <HistoryTelemetryPanel
            samples={history.sessionSamples}
            loading={history.loadingSession}
            onSeek={history.onSeek}
            onHeightChange={setPanelHeight}
          />
          <HistoryControls
            title={`${new Date(history.selectedSession.startAtMs).toLocaleString()} · ${
              history.selectedSession.deviceName
            }`}
            canPrevious={!!history.previousRide}
            canNext={!!history.nextRide}
            loading={history.loadingSession || history.historyLoading}
            onBack={history.exitHistory}
            onPrevious={() => {
              if (history.previousRide) void history.selectSession(history.previousRide)
            }}
            onNext={() => {
              if (history.nextRide) void history.selectSession(history.nextRide)
            }}
            onOpenList={() => history.setHistorySheetVisible(true)}
          />
        </>
      )}

      {mode === 'history' && !history.selectedSession && !history.loadingSession && (
        <HistoryControls
          title="No rides yet"
          canPrevious={false}
          canNext={false}
          loading={false}
          onBack={history.exitHistory}
          onPrevious={() => undefined}
          onNext={() => undefined}
          onOpenList={() => history.setHistorySheetVisible(true)}
        />
      )}

      <HistorySessionSheet
        visible={history.historySheetVisible}
        sessions={history.sessions}
        selectedSessionId={history.selectedSession?.id ?? null}
        onClose={() => history.setHistorySheetVisible(false)}
        onSelectSession={history.selectRide}
      />

      {history.historyError ? (
        <View style={[styles.historyError, { bottom: aboveStripBottom }]}>
          <Text style={styles.historyErrorText} selectable>
            {history.historyError}
          </Text>
        </View>
      ) : null}
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
  historyButton: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
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
})

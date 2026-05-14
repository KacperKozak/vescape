import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  ToastAndroid,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { ArrowLeftIcon, ClockCounterClockwiseIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import { TopBar } from '@/screens/center/TopBar'
import { LiveHud } from '@/screens/center/LiveHud'
import { BottomTelemetryStrip } from '@/screens/center/BottomTelemetryStrip'
import { MapVignette } from '@/screens/center/MapVignette'
import { HistoryControls } from '@/screens/center/HistoryControls'
import {
  canShowBaseOverlays,
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from '@/screens/center/centerState'
import { FloatingBar } from '@/components/FloatingBar'
import { HistorySessionSheet } from '@/components/history/HistorySessionSheet'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useHistoryStore, type HistorySession } from '@/store/historyStore'
import { useMapStore } from '@/store/mapStore'
import { type MapStyleKey } from '@/constants/mapStyles'

interface CenterScreenProps {
  activeBoard: Board | undefined
  activeBoardId: string | null
  boards: Board[]
  boardsLoaded: boolean
  bleStatus: string
  recordDebugSession: boolean
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
}

export function CenterScreen({
  activeBoard,
  activeBoardId,
  boards,
  boardsLoaded,
  bleStatus,
  recordDebugSession,
  onStopScan,
  onRetryConnect,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
}: CenterScreenProps) {
  const mapRef = useRef<CenterMapHandle>(null)
  const backPressedOnce = useRef(false)
  const [mapFocused, setMapFocused] = useState(false)
  const [historySheetVisible, setHistorySheetVisible] = useState(false)
  const [historyLoadedOnce, setHistoryLoadedOnce] = useState(false)
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>('onedark')
  const [heading, setHeading] = useState(0)
  const [rotationLocked, setRotationLocked] = useState(false)
  const [perspectiveEnabled, setPerspectiveEnabled] = useState(true)
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const {
    sessions,
    selectedSession,
    sessionGpsSamples,
    sessionMarkers,
    loadingSession,
    loading: historyLoading,
    error: historyError,
    loadInitial,
    selectSession,
  } = useHistoryStore(
    useShallow((s) => ({
      sessions: s.sessions,
      selectedSession: s.selectedSession,
      sessionGpsSamples: s.sessionGpsSamples,
      sessionMarkers: s.sessionMarkers,
      loadingSession: s.loadingSession,
      loading: s.loading,
      error: s.error,
      loadInitial: s.loadInitial,
      selectSession: s.selectSession,
    })),
  )
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore(
    useShallow((s) => ({
      targetLocation: s.targetLocation,
      setTargetLocation: s.setTargetLocation,
      clearTargetLocation: s.clearTargetLocation,
    })),
  )
  const hasBle = !!activeBoard?.bleId
  const rideActive = !!selectedSession
  const previousRide = getPreviousRideSession(sessions, selectedSession)
  const nextRide = getNextRideSession(sessions, selectedSession)
  const showBaseOverlays = canShowBaseOverlays({ mapFocused, hasRide: rideActive })

  const exitMapFocus = useCallback(() => {
    setMapFocused(false)
    mapRef.current?.recenterLive()
  }, [])

  const enterRideReview = async () => {
    setMapFocused(false)
    if (!historyLoadedOnce) {
      await loadInitial()
      setHistoryLoadedOnce(true)
    }
    const latest = getLatestSession(useHistoryStore.getState().sessions)
    if (latest) {
      await selectSession(latest)
    }
  }

  const exitRideReview = useCallback(() => {
    void selectSession(null)
    setMapFocused(false)
    requestAnimationFrame(() => mapRef.current?.recenterLive())
  }, [selectSession])

  const selectRide = (session: HistorySession) => {
    setHistorySheetVisible(false)
    void selectSession(session)
  }

  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (rideActive) {
          exitRideReview()
          return true
        }
        if (mapFocused) {
          exitMapFocus()
          return true
        }
        if (backPressedOnce.current) {
          BackHandler.exitApp()
          return true
        }
        backPressedOnce.current = true
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT)
        setTimeout(() => {
          backPressedOnce.current = false
        }, 2000)
        return true
      })
      return () => handler.remove()
    }, [exitMapFocus, exitRideReview, mapFocused, rideActive]),
  )

  if (!boardsLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.emptySubtitle}>Loading boards...</Text>
        </View>
      </View>
    )
  }

  if (!hasBle) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          {activeBoard ? (
            <>
              <Text style={styles.emptyTitle}>{activeBoard.name}</Text>
              <Text style={styles.emptySubtitle}>No device paired</Text>
              <Pressable
                style={styles.settingsButton}
                onPress={() =>
                  router.push({
                    pathname: routes.addBoardDetails,
                    params: { boardId: activeBoard.id },
                  })
                }
              >
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No board added yet</Text>
              <Pressable style={styles.addButton} onPress={() => router.push(routes.addBoardScan)}>
                <Text style={styles.addButtonText}>+ Add your first board</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CenterMap
        ref={mapRef}
        liveLocations={liveLocations}
        rideGpsSamples={sessionGpsSamples}
        rideMarkers={sessionMarkers}
        rideActive={rideActive}
        mapStyleKey={mapStyleKey}
        rotationLocked={rotationLocked}
        perspectiveEnabled={perspectiveEnabled}
        onPerspectiveChange={setPerspectiveEnabled}
        onHeadingChange={setHeading}
        onMapFocus={() => setMapFocused(true)}
        onLongPressTarget={setTargetLocation}
        targetLocation={targetLocation}
        onClearTarget={clearTargetLocation}
      />
      <MapVignette visible={showBaseOverlays} />
      <LiveHud visible={showBaseOverlays} />
      <BottomTelemetryStrip visible={showBaseOverlays} />
      <TopBar
        visible={showBaseOverlays}
        boards={boards}
        activeBoardId={activeBoardId}
        activeBoard={activeBoard}
        bleStatus={bleStatus}
        recordDebugSession={recordDebugSession}
        onSelectBoard={onSelectBoard}
        onAddBoard={onAddBoard}
        onToggleRecordDebug={onToggleRecordDebug}
        onDisconnect={onStopScan}
        onRetryConnect={onRetryConnect}
      />
      {showBaseOverlays && (
        <FloatingBar
          bleStatus={bleStatus}
          activeBoard={activeBoard}
          onStopScan={onStopScan}
          onRetryConnect={onRetryConnect}
          bottomOffset={88}
        />
      )}
      {showBaseOverlays && (
        <Pressable style={styles.historyButton} onPress={() => void enterRideReview()}>
          <ClockCounterClockwiseIcon size={18} color="#f8fafc" weight="bold" />
        </Pressable>
      )}
      {mapFocused && (
        <>
          <Pressable style={styles.backButton} onPress={exitMapFocus}>
            <ArrowLeftIcon size={20} color="#f8fafc" weight="bold" />
          </Pressable>
          <MapControls
            heading={heading}
            rotationLocked={rotationLocked}
            perspectiveEnabled={perspectiveEnabled}
            followGps={false}
            showClearTarget={!!targetLocation}
            onResetRotation={() => mapRef.current?.resetRotation()}
            onToggleRotationLock={() => setRotationLocked((prev) => !prev)}
            onTogglePerspective={() => mapRef.current?.togglePerspective()}
            onRecenter={exitMapFocus}
            onClearTarget={clearTargetLocation}
          />
          <MapStyleSwitch activeKey={mapStyleKey} onSelect={setMapStyleKey} />
        </>
      )}
      {rideActive && (
        <HistoryControls
          title={`${new Date(selectedSession.startAtMs).toLocaleString()} · ${
            selectedSession.deviceName
          }`}
          canPrevious={!!previousRide}
          canNext={!!nextRide}
          loading={loadingSession || historyLoading}
          onBack={exitRideReview}
          onPrevious={() => {
            if (previousRide) void selectSession(previousRide)
          }}
          onNext={() => {
            if (nextRide) void selectSession(nextRide)
          }}
          onOpenList={() => setHistorySheetVisible(true)}
        />
      )}
      <HistorySessionSheet
        visible={historySheetVisible}
        sessions={sessions}
        selectedSessionId={selectedSession?.id ?? null}
        onClose={() => setHistorySheetVisible(false)}
        onSelectSession={selectRide}
      />
      {historyLoadedOnce && !historyLoading && sessions.length === 0 && !selectedSession && (
        <HistoryControls
          title="No rides yet"
          canPrevious={false}
          canNext={false}
          loading={false}
          onBack={() => setHistoryLoadedOnce(false)}
          onPrevious={() => undefined}
          onNext={() => undefined}
          onOpenList={() => setHistorySheetVisible(true)}
        />
      )}
      {historyError ? (
        <View style={styles.historyError}>
          <Text style={styles.historyErrorText} selectable>
            {historyError}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  settingsButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingsButtonText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
  backButton: {
    position: 'absolute',
    top: 44,
    left: 12,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  historyButton: {
    position: 'absolute',
    right: 12,
    bottom: 76,
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
    bottom: 76,
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

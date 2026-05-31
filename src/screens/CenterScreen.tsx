import { useRef } from 'react'
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native'

import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import { CenterOverlays } from '@/screens/center/CenterOverlays'
import { useCenterScreenController } from '@/screens/center/useCenterScreenController'
import type { Board } from '@/store/boardStore'
import { theme } from '@/constants/theme'

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
  const controller = useCenterScreenController({ mapRef })

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

  return (
    <View style={styles.container}>
      <CenterMap
        ref={mapRef}
        mode={controller.mode}
        liveLocations={controller.liveLocations}
        latestApproximateLocation={controller.latestApproximateLocation}
        rideGpsSamples={controller.sessionGpsSamples}
        rideTelemetrySamples={controller.sessionSamples}
        rideMarkers={controller.sessionMarkers}
        activeHistoryMapMetric={controller.activeHistoryMapMetric}
        historyPreview={controller.historyPreview}
        historyActive={controller.historyActive}
        mapStyleKey={controller.mapStyleKey}
        mapNavigationMode={controller.mapNavigationMode}
        rotationLocked={controller.rotationLocked}
        perspectiveEnabled={controller.perspectiveEnabled}
        onPerspectiveChange={controller.setPerspectiveEnabled}
        onHeadingChange={controller.setHeading}
        onLongPressTarget={controller.setTargetLocation}
        onMapInteraction={controller.dismissMapSelector}
        targetLocation={controller.targetLocation}
        onClearTarget={controller.clearTargetLocation}
        weatherActive={controller.weatherActive}
        seekPosition={controller.seekGpsPosition}
      />
      <CenterOverlays
        mode={controller.mode}
        mapRef={mapRef}
        board={{
          boards,
          activeBoardId,
          activeBoard,
          bleStatus,
          recordDebugSession,
          onStopScan,
          onRetryConnect,
          onSelectBoard,
          onAddBoard,
          onToggleRecordDebug,
        }}
        map={{
          heading: controller.heading,
          mapStyleKey: controller.mapStyleKey,
          setMapStyleKey: controller.setMapStyleKey,
          mapNavigationMode: controller.mapNavigationMode,
          setMapNavigationMode: controller.setMapNavigationMode,
          mapSelector: controller.mapSelector,
          setMapSelector: controller.setMapSelector,
          enterMapFocus: controller.handleMapFocus,
          exitMapFocus: controller.exitMapFocus,
          enterWeather: controller.enterWeatherMode,
          exitWeather: controller.exitWeatherMode,
          refreshWeather: controller.refreshWeather,
          weatherLocation: controller.liveLocations.at(-1) ?? controller.latestApproximateLocation,
        }}
        history={{
          enterHistoryMode: controller.enterHistoryMode,
          selectedSession: controller.selectedSession,
          sessionSamples: controller.sessionSamples,
          previousRide: controller.previousRide,
          nextRide: controller.nextRide,
          canPreviousRide: controller.canPreviousRide,
          loadingSession: controller.loadingSession,
          historyLoading: controller.historyLoading,
          historyHasMore: controller.historyHasMore,
          historyError: controller.historyError,
          blocks: controller.blocks,
          sessions: controller.sessions,
          historySheetVisible: controller.historySheetVisible,
          setHistorySheetVisible: controller.setHistorySheetVisible,
          selectSession: controller.selectSession,
          loadMoreHistory: controller.loadMoreHistory,
          selectPreviousRide: controller.selectPreviousRide,
          selectNextRide: controller.selectNextRide,
          selectRide: controller.selectRide,
          exitHistory: controller.exitHistory,
          removeSession: controller.removeSession,
          onSeek: controller.onSeek,
          setActiveHistoryMapMetric: controller.setActiveHistoryMapMetric,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.surfaceDeep,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptySubtitle: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
})

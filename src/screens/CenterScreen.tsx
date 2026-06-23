import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native'

import {
  CenterMap,
  type CenterMapHandle,
  type OffscreenMapIndicatorState,
} from '@/screens/center/CenterMap'
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
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
}

export function CenterScreen({
  activeBoard,
  activeBoardId,
  boards,
  boardsLoaded,
  bleStatus,
  onStopScan,
  onRetryConnect,
  onSelectBoard,
  onAddBoard,
}: CenterScreenProps) {
  const mapRef = useRef<CenterMapHandle>(null)
  const [offscreenMapIndicators, setOffscreenMapIndicators] = useState<
    OffscreenMapIndicatorState[]
  >([])
  const controller = useCenterScreenController({ mapRef })
  const dismissMapSelector = controller.dismissMapSelector
  const [mapInteractionRevision, setMapInteractionRevision] = useState(0)
  const handleMapInteraction = useCallback(() => {
    dismissMapSelector()
    setMapInteractionRevision((revision) => revision + 1)
  }, [dismissMapSelector])
  const handleOffscreenIndicatorPress = useCallback(
    (indicator: OffscreenMapIndicatorState) => {
      controller.dismissMapSelector()
      if (indicator.type === 'gps') {
        mapRef.current?.recenterLive({ resetPadding: true })
        return
      }
      controller.handleMapFocus()
      mapRef.current?.focusCoordinate(indicator.coordinate)
    },
    [controller],
  )

  if (!boardsLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={theme.wheel.color} />
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
        mediaAssets={controller.mediaHistory.assets}
        onOpenMedia={controller.openMedia}
        activeHistoryMapMetric={controller.activeHistoryMapMetric}
        historyPreview={controller.historyPreview}
        historyActive={controller.historyActive}
        mapStyleKey={controller.mapStyleKey}
        mapNavigationMode={controller.mapNavigationMode}
        rotationLocked={controller.rotationLocked}
        perspectiveEnabled={controller.perspectiveEnabled}
        onPerspectiveChange={controller.setPerspectiveEnabled}
        onHeadingChange={controller.setHeading}
        onLongPressTarget={(target) =>
          void controller.replaceDirectionPoint(target.latitude, target.longitude)
        }
        onMapInteraction={handleMapInteraction}
        onMapPress={() => {
          handleMapInteraction()
          controller.clearSelectedMapPoints()
        }}
        onEnterMapMode={controller.handleMapFocus}
        onOffscreenMapIndicatorsChange={setOffscreenMapIndicators}
        directionPoint={controller.directionPoint}
        mapPoints={controller.mapPoints}
        selectedMapPointId={controller.selectedMapPointId}
        hiddenMapPointKinds={controller.hiddenMapPointKinds}
        onToggleMapPointSelection={controller.toggleMapPointSelection}
        onRemoveMapPoint={(id) => void controller.removeMapPoint(id)}
        onClearDirectionPoint={() => void controller.clearDirectionPoint()}
        weatherActive={controller.weatherActive}
        seekPosition={controller.seekGpsPosition}
      />
      <CenterOverlays
        mode={controller.mode}
        mapRef={mapRef}
        mapInteractionRevision={mapInteractionRevision}
        board={{
          boards,
          activeBoardId,
          activeBoard,
          bleStatus,
          onStopScan,
          onRetryConnect,
          onSelectBoard,
          onAddBoard,
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
          replaceDirectionPoint: controller.replaceDirectionPoint,
          addMapPoint: controller.saveMapPoint,
          hiddenMapPointKinds: controller.hiddenMapPointKinds,
          toggleMapPointKindVisibility: controller.toggleMapPointKindVisibility,
          offscreenMapIndicators,
          onOffscreenIndicatorPress: handleOffscreenIndicatorPress,
        }}
        history={{
          enterHistoryMode: controller.enterHistoryMode,
          selectedSession: controller.selectedSession,
          sessionSamples: controller.sessionSamples,
          sessionMarkers: controller.sessionMarkers,
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
          mediaHistory: controller.mediaHistory,
          openMediaAssetId: controller.openMediaAssetId,
          closeMedia: controller.closeMedia,
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

import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'

import { VescapeWordmark } from '@/components/ui/base/VescapeWordmark'
import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import type { OffscreenMapIndicatorState } from '@/screens/center/offscreenMapIndicators'
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
  const mapHeading = useSharedValue(0)
  const handleHeadingChange = useCallback(
    (heading: number) => {
      mapHeading.set(heading)
    },
    [mapHeading],
  )
  const [offscreenMapIndicators, setOffscreenMapIndicators] = useState<
    OffscreenMapIndicatorState[]
  >([])
  const controller = useCenterScreenController({ mapRef })
  const dismissMapSelector = controller.dismissMapSelector
  const mapInteractionHandlerRef = useRef<() => void>(() => {})
  const handleMapInteraction = useCallback(() => {
    dismissMapSelector()
    mapInteractionHandlerRef.current()
  }, [dismissMapSelector])
  const { replaceDirectionPoint, clearSelectedMapPoints, removeMapPoint, clearDirectionPoint } =
    controller
  const handleLongPressTarget = useCallback(
    (target: { latitude: number; longitude: number }) =>
      void replaceDirectionPoint(target.latitude, target.longitude),
    [replaceDirectionPoint],
  )
  const handleMapPress = useCallback(() => {
    handleMapInteraction()
    clearSelectedMapPoints()
  }, [clearSelectedMapPoints, handleMapInteraction])
  const handleRemoveMapPoint = useCallback(
    (id: string) => void removeMapPoint(id),
    [removeMapPoint],
  )
  const handleClearDirectionPoint = useCallback(
    () => void clearDirectionPoint(),
    [clearDirectionPoint],
  )
  const handleOffscreenIndicatorPress = useCallback(
    (indicator: OffscreenMapIndicatorState) => {
      controller.dismissMapSelector()
      if (indicator.type === 'gps') {
        mapRef.current?.recenterLive({ resetPadding: true })
        return
      }
      controller.handleMapFocus()
      mapRef.current?.focusCoordinate(indicator.coordinate.value)
    },
    [controller],
  )

  if (!boardsLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <VescapeWordmark width={220} />
          <ActivityIndicator size="small" color={theme.palette.sky.color} />
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
        historySelectionKey={controller.selectedSession?.id ?? null}
        historyPreview={controller.historyPreview}
        historyPreviewRoute={controller.historyPreviewRoute}
        historyActive={controller.historyActive}
        mapStyleKey={controller.mapStyleKey}
        mapNavigationMode={controller.mapNavigationMode}
        rotationLocked={controller.rotationLocked}
        perspectiveEnabled={controller.perspectiveEnabled}
        onPerspectiveChange={controller.setPerspectiveEnabled}
        onHeadingChange={handleHeadingChange}
        onLongPressTarget={handleLongPressTarget}
        onMapInteraction={handleMapInteraction}
        onMapPress={handleMapPress}
        onEnterMapMode={controller.handleMapFocus}
        onOffscreenMapIndicatorsChange={setOffscreenMapIndicators}
        directionPoint={controller.directionPoint}
        mapPoints={controller.mapPoints}
        selectedMapPointId={controller.selectedMapPointId}
        hiddenMapPointKinds={controller.hiddenMapPointKinds}
        onToggleMapPointSelection={controller.toggleMapPointSelection}
        onRemoveMapPoint={handleRemoveMapPoint}
        onClearDirectionPoint={handleClearDirectionPoint}
        weatherActive={controller.weatherActive}
      />
      <CenterOverlays
        mode={controller.mode}
        mapRef={mapRef}
        mapInteractionHandlerRef={mapInteractionHandlerRef}
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
          heading: mapHeading,
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
          openMedia: controller.openMedia,
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
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
})

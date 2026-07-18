import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'

import { VescapeWordmark } from '@/components/ui/base/VescapeWordmark'
import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import type { OffscreenMapIndicatorState } from '@/screens/center/offscreenMapIndicators'
import { CenterOverlays } from '@/screens/center/CenterOverlays'
import { useCenterScreenController } from '@/screens/center/useCenterScreenController'
import type { Board } from '@/store/boardStore'
import { theme } from '@/constants/theme'
import { getMapPointKindLabel } from '@/constants/mapPoints'
import type { MapSelection } from '@/lib/map/mapSelection'
import { reverseGeocodeMapCoordinate } from '@/lib/map/search'

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
  const cameraHeading = useSharedValue(0)
  const selectorHeading = useSharedValue(0)
  const controller = useCenterScreenController({ mapRef })
  const handleHeadingChange = useCallback(
    (heading: number) => {
      cameraHeading.set(heading)
      if (!(controller.mode === 'telemetry' && controller.mapNavigationMode === 'phoneHeading')) {
        selectorHeading.set(heading)
      }
    },
    [cameraHeading, controller.mapNavigationMode, controller.mode, selectorHeading],
  )
  const handlePhoneHeadingChange = useCallback(
    (heading: number | null) => {
      if (heading == null) return
      if (controller.mode === 'telemetry' && controller.mapNavigationMode === 'phoneHeading') {
        selectorHeading.set(heading)
      }
    },
    [controller.mapNavigationMode, controller.mode, selectorHeading],
  )
  useEffect(() => {
    if (controller.mode === 'telemetry' && controller.mapNavigationMode === 'phoneHeading') return
    selectorHeading.set(cameraHeading.value)
  }, [cameraHeading, controller.mapNavigationMode, controller.mode, selectorHeading])
  const [offscreenMapIndicators, setOffscreenMapIndicators] = useState<
    OffscreenMapIndicatorState[]
  >([])
  const [selectedNavigationTarget, setSelectedNavigationTarget] = useState<MapSelection | null>(
    null,
  )
  const [activeNavigationTarget, setActiveNavigationTarget] = useState<MapSelection | null>(null)
  const dismissMapSelector = controller.dismissMapSelector
  const mapInteractionHandlerRef = useRef<() => void>(() => {})
  const handleMapInteraction = useCallback(() => {
    dismissMapSelector()
    mapInteractionHandlerRef.current()
  }, [dismissMapSelector])
  const {
    replaceDirectionPoint,
    clearSelectedMapPoints,
    removeMapPoint,
    clearDirectionPoint,
    toggleMapPointSelection,
  } = controller
  const handleLongPressTarget = useCallback(
    (target: { latitude: number; longitude: number }) => {
      void replaceDirectionPoint(target.latitude, target.longitude)
      setActiveNavigationTarget({
        type: 'coordinate',
        id: `direction-${target.longitude.toFixed(6)}-${target.latitude.toFixed(6)}`,
        latitude: target.latitude,
        longitude: target.longitude,
        title: 'Direction point',
        subtitle: null,
        loadingDetails: true,
      })
    },
    [replaceDirectionPoint],
  )
  const handleMapPress = useCallback(
    (selection: MapSelection) => {
      handleMapInteraction()
      clearSelectedMapPoints()
      setSelectedNavigationTarget(selection)
    },
    [clearSelectedMapPoints, handleMapInteraction],
  )
  const handleSelectNavigationTarget = useCallback(
    (selection: MapSelection) => {
      clearSelectedMapPoints()
      setSelectedNavigationTarget(selection)
    },
    [clearSelectedMapPoints],
  )
  const handleToggleMapPointSelection = useCallback(
    (id: string) => {
      const selected = controller.selectedMapPointId !== id
      const point = controller.mapPoints.find((candidate) => candidate.id === id)
      toggleMapPointSelection(id)
      if (!selected || !point) {
        setSelectedNavigationTarget(null)
        return
      }
      setSelectedNavigationTarget({
        type: 'mapPoint',
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        title: getMapPointKindLabel(point.kind),
        subtitle: null,
        point,
      })
    },
    [controller.mapPoints, controller.selectedMapPointId, toggleMapPointSelection],
  )
  const handleRemoveMapPoint = useCallback(
    (id: string) => {
      setSelectedNavigationTarget((current) =>
        current?.type === 'mapPoint' && current.id === id ? null : current,
      )
      void removeMapPoint(id)
    },
    [removeMapPoint],
  )
  const handleClearDirectionPoint = useCallback(() => {
    setActiveNavigationTarget(null)
    void clearDirectionPoint()
  }, [clearDirectionPoint])
  const handleDismissSelectedTarget = useCallback(() => {
    clearSelectedMapPoints()
    setSelectedNavigationTarget(null)
  }, [clearSelectedMapPoints])
  const handleOffscreenIndicatorPress = useCallback(
    (indicator: OffscreenMapIndicatorState) => {
      controller.dismissMapSelector()
      setSelectedNavigationTarget(null)
      if (indicator.type === 'gps') {
        mapRef.current?.recenterLive({ resetPadding: true })
        return
      }
      controller.handleMapFocus()
      mapRef.current?.focusCoordinate(indicator.coordinate.value)
    },
    [controller],
  )
  const handleNavigateSelectedTarget = useCallback(async () => {
    if (!selectedNavigationTarget) return
    await replaceDirectionPoint(
      selectedNavigationTarget.latitude,
      selectedNavigationTarget.longitude,
    )
    setActiveNavigationTarget({
      ...selectedNavigationTarget,
      id: `direction-${selectedNavigationTarget.id}`,
      title:
        selectedNavigationTarget.type === 'coordinate'
          ? 'Direction point'
          : selectedNavigationTarget.title,
    })
    clearSelectedMapPoints()
    setSelectedNavigationTarget(null)
    controller.exitMapFocus()
  }, [clearSelectedMapPoints, controller, replaceDirectionPoint, selectedNavigationTarget])

  useEffect(() => {
    if (!selectedNavigationTarget?.loadingDetails) return
    const abortController = new AbortController()
    const { id, latitude, longitude, type } = selectedNavigationTarget
    void reverseGeocodeMapCoordinate(latitude, longitude, { signal: abortController.signal })
      .then((details) => {
        if (!details) {
          setSelectedNavigationTarget((current) =>
            current?.id === id && current.type === type
              ? { ...current, loadingDetails: false }
              : current,
          )
          return
        }
        setSelectedNavigationTarget((current) =>
          current?.id === id && current.type === type
            ? {
                ...current,
                title: current.type === 'coordinate' ? details.title : current.title,
                subtitle: current.subtitle ?? details.subtitle,
                loadingDetails: false,
              }
            : current,
        )
      })
      .catch(() => {
        if (abortController.signal.aborted) return
        setSelectedNavigationTarget((current) =>
          current?.id === id && current.type === type
            ? { ...current, loadingDetails: false }
            : current,
        )
      })
    return () => abortController.abort()
  }, [selectedNavigationTarget])

  useEffect(() => {
    if (!activeNavigationTarget?.loadingDetails) return
    const abortController = new AbortController()
    const { id, latitude, longitude, type } = activeNavigationTarget
    void reverseGeocodeMapCoordinate(latitude, longitude, { signal: abortController.signal })
      .then((details) => {
        setActiveNavigationTarget((current) =>
          current?.id === id && current.type === type
            ? {
                ...current,
                subtitle: current.subtitle ?? details?.subtitle ?? null,
                loadingDetails: false,
              }
            : current,
        )
      })
      .catch(() => {
        if (abortController.signal.aborted) return
        setActiveNavigationTarget((current) =>
          current?.id === id && current.type === type
            ? { ...current, loadingDetails: false }
            : current,
        )
      })
    return () => abortController.abort()
  }, [activeNavigationTarget])

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
        satelliteOverlayEnabled={controller.satelliteOverlayEnabled}
        satelliteImageryOpacity={controller.satelliteImageryOpacity}
        satelliteMapImageryOpacity={controller.satelliteMapImageryOpacity}
        satelliteImagerySaturation={controller.satelliteImagerySaturation}
        hideTelemetryMapDetails={controller.hideTelemetryMapDetails}
        mapNavigationMode={controller.mapNavigationMode}
        rotationLocked={controller.rotationLocked}
        perspectiveEnabled={controller.perspectiveEnabled}
        onPerspectiveChange={controller.setPerspectiveEnabled}
        onHeadingChange={handleHeadingChange}
        onPhoneHeadingChange={handlePhoneHeadingChange}
        onLongPressTarget={handleLongPressTarget}
        onMapInteraction={handleMapInteraction}
        onMapPress={handleMapPress}
        onEnterMapMode={controller.handleMapFocus}
        onOffscreenMapIndicatorsChange={setOffscreenMapIndicators}
        directionPoint={controller.directionPoint}
        selectedNavigationTarget={selectedNavigationTarget}
        mapPoints={controller.mapPoints}
        selectedMapPointId={controller.selectedMapPointId}
        hiddenMapPointKinds={controller.hiddenMapPointKinds}
        onToggleMapPointSelection={handleToggleMapPointSelection}
        onRemoveMapPoint={handleRemoveMapPoint}
        onClearDirectionPoint={handleClearDirectionPoint}
        weatherActive={controller.weatherActive}
        legalLimitsActive={controller.legalLimitsActive}
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
          heading: selectorHeading,
          mapStyleKey: controller.mapStyleKey,
          setMapStyleKey: controller.setMapStyleKey,
          satelliteMapImageryOpacity: controller.satelliteMapImageryOpacity,
          setSatelliteMapImageryOpacity: controller.setSatelliteMapImageryOpacity,
          mapNavigationMode: controller.mapNavigationMode,
          setMapNavigationMode: controller.setMapNavigationMode,
          mapSelector: controller.mapSelector,
          setMapSelector: controller.setMapSelector,
          enterMapFocus: controller.handleMapFocus,
          exitMapFocus: controller.exitMapFocus,
          enterWeather: controller.enterWeatherMode,
          exitWeather: controller.exitWeatherMode,
          enterLegalLimits: controller.enterLegalLimitsMode,
          exitLegalLimits: controller.exitLegalLimitsMode,
          refreshWeather: controller.refreshWeather,
          weatherLocation: controller.liveLocations.at(-1) ?? controller.latestApproximateLocation,
          directionPoint: controller.directionPoint,
          activeNavigationTarget,
          selectedNavigationTarget,
          onSelectNavigationTarget: handleSelectNavigationTarget,
          onNavigateSelectedTarget: handleNavigateSelectedTarget,
          onCancelNavigation: handleClearDirectionPoint,
          onDismissSelectedTarget: handleDismissSelectedTarget,
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

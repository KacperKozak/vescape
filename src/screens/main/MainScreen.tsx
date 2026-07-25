import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'

import { VescapeWordmark } from '@/components/base/VescapeWordmark'
import { MainMap, type MainMapHandle } from '@/screens/main/map/MainMap'
import type { OffscreenMapIndicatorState } from '@/screens/main/map/offscreenMapIndicators'
import { MainOverlays } from '@/screens/main/overlays/MainOverlays'
import { useMainScreenController } from '@/screens/main/useMainScreenController'
import type { Board } from '@/modules/board/store/boardStore'
import { theme } from '@/constants/theme'
import { getMapPointKindLabel } from '@/modules/map/constants/mapPoints'
import type { MapSelection } from '@/modules/map/lib/mapSelection'
import { reverseGeocodeMapCoordinate } from '@/modules/map/lib/search'

interface MainScreenProps {
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

export function MainScreen({
  activeBoard,
  activeBoardId,
  boards,
  boardsLoaded,
  bleStatus,
  onStopScan,
  onRetryConnect,
  onSelectBoard,
  onAddBoard,
}: MainScreenProps) {
  const mapRef = useRef<MainMapHandle>(null)
  const cameraHeading = useSharedValue(0)
  const selectorHeading = useSharedValue(0)
  const controller = useMainScreenController({ mapRef })
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
  const mapInteractionHandlerRef = useRef<(selection?: MapSelection) => boolean | void>(() => {})
  const handleMapInteraction = useCallback(() => {
    dismissMapSelector()
    mapInteractionHandlerRef.current()
  }, [dismissMapSelector])
  const {
    replaceDirectionPoint,
    clearSelectedMapPoints,
    removeMapPoint,
    clearDirectionPoint,
    updateMapPoint,
    setMapPointReaction,
    selectMapPoint,
    toggleMapPointSelection,
  } = controller
  const handleLongPressTarget = useCallback(
    (target: { latitude: number; longitude: number }) => {
      clearSelectedMapPoints()
      setSelectedNavigationTarget({
        type: 'coordinate',
        id: `long-press-${target.longitude.toFixed(6)}-${target.latitude.toFixed(6)}`,
        latitude: target.latitude,
        longitude: target.longitude,
        title: 'Dropped pin',
        subtitle: null,
        loadingDetails: true,
      })
    },
    [clearSelectedMapPoints],
  )
  const handleRawMapPress = useCallback((selection: MapSelection) => {
    return mapInteractionHandlerRef.current(selection) === true
  }, [])
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
      if (selection.type === 'mapPoint') {
        selectMapPoint(selection.id)
      } else {
        clearSelectedMapPoints()
      }
      setSelectedNavigationTarget(selection)
    },
    [clearSelectedMapPoints, selectMapPoint],
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
        title: point.name?.trim() || getMapPointKindLabel(point.kind),
        subtitle: point.description ?? null,
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
      setActiveNavigationTarget((current) =>
        current?.type === 'mapPoint' && current.point.id === id ? null : current,
      )
      void removeMapPoint(id)
    },
    [removeMapPoint],
  )
  const handleSetMapPointReaction = useCallback(
    (id: string, reaction: 'up' | 'down' | null) => {
      void setMapPointReaction(id, reaction).then((point) => {
        if (!point) return
        setSelectedNavigationTarget((current) =>
          current?.type === 'mapPoint' && current.id === id
            ? {
                ...current,
                point,
                title: point.name || getMapPointKindLabel(point.kind),
                subtitle: point.description ?? null,
              }
            : current,
        )
      })
    },
    [setMapPointReaction],
  )
  const handleUpdateMapPoint = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          NonNullable<Extract<MapSelection, { type: 'mapPoint' }>['point']>,
          'name' | 'description' | 'media'
        >
      >,
    ) => {
      const point = await updateMapPoint(id, patch)
      if (!point) return null
      const nextSelection: MapSelection = {
        type: 'mapPoint',
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        title: point.name || getMapPointKindLabel(point.kind),
        subtitle: point.description ?? null,
        point,
      }
      setSelectedNavigationTarget((current) =>
        current?.type === 'mapPoint' && current.id === id ? nextSelection : current,
      )
      setActiveNavigationTarget((current) =>
        current?.type === 'mapPoint' && current.point.id === id
          ? {
              ...current,
              title: nextSelection.title,
              subtitle: nextSelection.subtitle,
              point,
            }
          : current,
      )
      return point
    },
    [updateMapPoint],
  )
  const handleClearDirectionPoint = useCallback(() => {
    setActiveNavigationTarget(null)
    void clearDirectionPoint()
  }, [clearDirectionPoint])
  const handleDismissSelectedTarget = useCallback(() => {
    clearSelectedMapPoints()
    setSelectedNavigationTarget(null)
  }, [clearSelectedMapPoints])

  useEffect(() => {
    if (controller.mode !== 'telemetry') return
    const frame = requestAnimationFrame(() => {
      clearSelectedMapPoints()
      setSelectedNavigationTarget(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [clearSelectedMapPoints, controller.mode])

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
  const navigateToTarget = useCallback(
    async (target: MapSelection) => {
      await replaceDirectionPoint(target.latitude, target.longitude)
      setActiveNavigationTarget({
        ...target,
        id: `direction-${target.id}`,
        title: target.type === 'coordinate' ? 'Direction point' : target.title,
      })
      clearSelectedMapPoints()
      setSelectedNavigationTarget(null)
      controller.exitMapFocus()
    },
    [clearSelectedMapPoints, controller, replaceDirectionPoint],
  )
  const handleNavigateSelectedTarget = useCallback(async () => {
    if (!selectedNavigationTarget) return
    await navigateToTarget(selectedNavigationTarget)
  }, [navigateToTarget, selectedNavigationTarget])
  const handleNavigateTarget = useCallback(
    async (target: MapSelection) => {
      await navigateToTarget(target)
    },
    [navigateToTarget],
  )

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
      <MainMap
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
        onRawMapPress={handleRawMapPress}
        onMapPress={handleMapPress}
        onEnterMapMode={controller.handleMapFocus}
        onOffscreenMapIndicatorsChange={setOffscreenMapIndicators}
        directionPoint={controller.directionPoint}
        activeNavigationTarget={activeNavigationTarget}
        selectedNavigationTarget={selectedNavigationTarget}
        mapPoints={controller.mapPoints}
        selectedMapPointId={controller.selectedMapPointId}
        hiddenMapPointKinds={controller.hiddenMapPointKinds}
        onToggleMapPointSelection={handleToggleMapPointSelection}
        weatherActive={controller.weatherActive}
        legalLimitsActive={controller.legalLimitsActive}
      />
      <MainOverlays
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
          onNavigateTarget: handleNavigateTarget,
          onNavigateSelectedTarget: handleNavigateSelectedTarget,
          onCancelNavigation: handleClearDirectionPoint,
          onDismissSelectedTarget: handleDismissSelectedTarget,
          addMapPoint: controller.saveMapPoint,
          updateMapPoint: handleUpdateMapPoint,
          setMapPointReaction: handleSetMapPointReaction,
          onRemoveMapPoint: handleRemoveMapPoint,
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

import Mapbox, { Camera } from '@rnmapbox/maps'
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from 'react'
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Text } from '@/components/base/Text'
import type { LocationEvent, MapPoint, MapPointCategory } from 'vescape-core'

import type { DirectionPoint } from '@/modules/map/store/mapStore'

import { InfoModal } from '@/components/modals/InfoModal'
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapy'
import {
  MAP_DEFAULTS,
  type MapNavigationMode,
  type MapStyleKey,
} from '@/modules/map/constants/mapStyles'
import { theme } from '@/constants/theme'
import {
  getLiveGpsPresentation,
  getReliableGpsBearingFromFixes,
} from '@/helpers/liveGpsPresentation'
import { distanceMeters, makeCircleFeature, makeTrailLineString } from '@/helpers/mapGeometry'
import type { MediaHistoryAsset } from '@/modules/history/lib/mediaHistory'
import type { MapSelection } from '@/modules/map/lib/mapSelection'
import { isMapPinKindVisible } from '@/modules/map-points/lib/mapPointVisibility'
import type { HistoryMetricKey } from '@/modules/history/lib/metricColorScale'
import { getNavigationFallbackReason } from '@/modules/map/lib/navigationDiagnostics'
import { getGpsPuckBearing } from '@/modules/map/lib/gpsPuckHeading'
import type { LegalLimitCountry } from '@/modules/legal/lib/legalLimits'
import type {
  HistoryGpsSample,
  HistoryMarker,
  TelemetrySample,
} from '@/modules/history/store/historyStore'
import { useGroupRideStore } from '@/modules/group-ride/store/groupRideStore'
import { useNavigationDiagnosticsStore } from '@/modules/map/store/navigationDiagnosticsStore'
import { useRiderStore } from '@/modules/group-ride/store/riderStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { useRenderRateWarning } from '@/hooks/useRenderRateWarning'

import type { MainViewState } from '@/screens/main/mainViewState'
import {
  type CameraSnapshot,
  type HistoryPreviewTarget,
  useCameraControls,
} from '@/screens/main/map/useCameraControls'
import { getLiveFollowCameraProfile, getPitchForZoom } from '@/modules/map/lib/cameraProfiles'
import { shouldPreserveLiveFollowGesture } from '@/modules/map/lib/cameraGestureState'
import {
  phoneHeadingAnimationDuration,
  type PhoneHeadingStatus,
} from '@/modules/map/lib/phoneHeading'
import { PhoneHeadingMapLayer } from '@/modules/map/components/PhoneHeadingMapLayer'
import { MainMapLayers } from '@/screens/main/map/MainMapLayers'
import { LegalLimitCountrySheet } from '@/modules/legal/components/LegalLimitCountrySheet'
import {
  OffscreenMapIndicator,
  type MapLayout,
  type OffscreenMapIndicatorState,
} from '@/screens/main/map/offscreenMapIndicators'
import {
  HISTORY_MARKER_LABELS,
  buildHistoryMarkerMessage,
  type SelectedHistoryMarker,
} from '@/modules/history/lib/historyMapMarkerInfo'
import { MapBaseStyleLayers } from '@/screens/main/map/MapBaseStyleLayers'
import { panPreservingCamera } from '@/screens/main/map/panPreservingCamera'
import {
  buildActiveNavigationPoint,
  buildGpsTrackedPoint,
  buildMapPointTrackedPoint,
  buildRiderPoints,
  buildRiderTargetPoints,
} from '@/screens/main/map/trackedMapPoints'
import { useMapPressHandlers } from '@/screens/main/map/useMapPressHandlers'
import { useOffscreenMapIndicators } from '@/screens/main/map/useOffscreenMapIndicators'
import { useResolvedMapStyle } from '@/screens/main/map/useResolvedMapStyle'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

const RIDER_FOCUS_MIN_ZOOM = 15

export interface MainMapHandle {
  recenterLive: (options?: { resetPadding?: boolean; animationDuration?: number }) => void
  previewHistorySession: (preview: HistoryPreviewTarget) => void
  beginPreviewPan: () => void
  previewPanBy: (
    deltaX: number,
    deltaY: number,
    animationDuration?: number,
    revealProgress?: number,
  ) => void
  endPreviewPan: () => void
  beginPreviewZoom: () => void
  previewZoomBy: (scale: number) => void
  endPreviewZoom: () => void
  restorePreviewPan: () => void
  resetRotation: () => void
  togglePerspective: () => void
  setPadding: (bottom: number) => void
  zoomBy: (delta: number) => void
  focusCoordinate: (coordinate: [number, number]) => void
  centerCoordinatePreservingCamera: (coordinate: [number, number]) => void
  focusWeather: () => void
  focusLegalLimits: () => void
  getViewfinderCoordinate: () => Promise<{ latitude: number; longitude: number }>
}

function usableCoordinate(location: { longitude: number; latitude: number } | null | undefined) {
  if (!location) return null
  if (!Number.isFinite(location.longitude) || !Number.isFinite(location.latitude)) return null
  return {
    longitude: location.longitude,
    latitude: location.latitude,
  }
}

/** Everything only the history layers care about; MainMap passes it straight through. */
export interface MainMapHistoryProps {
  active: boolean
  selectionKey: string | null
  preview: ({ key: string } & HistoryPreviewTarget) | null
  previewRoute: [number, number][]
  gpsSamples: HistoryGpsSample[]
  telemetrySamples: TelemetrySample[]
  markers: HistoryMarker[]
  mediaAssets: MediaHistoryAsset[]
  onOpenMedia: (asset: MediaHistoryAsset) => void
  activeMapMetric: HistoryMetricKey
}

export interface MainMapStyleProps {
  mapStyleKey: MapStyleKey
  satelliteOverlayEnabled: boolean
  satelliteImageryOpacity: number
  satelliteMapImageryOpacity: number
  satelliteImagerySaturation: number
  hideTelemetryMapDetails: boolean
}

export interface MainMapPointsProps {
  points: MapPoint[]
  selectedId: string | null
  hiddenCategories: MapPointCategory[]
  onToggleSelection: (id: string) => void
  /** Camera came to rest: where the map should read its Map Points around. */
  onCameraSettled: (latitude: number, longitude: number, zoom: number) => void
}

interface MainMapProps {
  mode: MainViewState
  liveLocations: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
  history: MainMapHistoryProps
  style: MainMapStyleProps
  mapPoints: MainMapPointsProps
  mapNavigationMode: MapNavigationMode
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onPhoneHeadingChange: (heading: number | null) => void
  onLongPressTarget: (target: { latitude: number; longitude: number }) => void
  onMapInteraction: () => void
  onRawMapPress: (selection: MapSelection) => boolean | void
  onMapPress: (selection: MapSelection) => void
  onEnterMapMode: () => void
  onOffscreenMapIndicatorsChange: (indicators: OffscreenMapIndicatorState[]) => void
  directionPoint: DirectionPoint | null
  activeNavigationTarget: MapSelection | null
  selectedNavigationTarget: MapSelection | null
  weatherActive: boolean
  legalLimitsActive: boolean
}

export const MainMap = memo(
  forwardRef<MainMapHandle, MainMapProps>(function MainMap(
    {
      mode,
      liveLocations,
      latestApproximateLocation,
      history,
      style: styleProps,
      mapPoints: mapPointProps,
      mapNavigationMode,
      rotationLocked,
      perspectiveEnabled,
      onPerspectiveChange,
      onHeadingChange,
      onPhoneHeadingChange,
      onLongPressTarget,
      onMapInteraction,
      onRawMapPress,
      onMapPress,
      onEnterMapMode,
      onOffscreenMapIndicatorsChange,
      directionPoint,
      activeNavigationTarget,
      selectedNavigationTarget,
      weatherActive,
      legalLimitsActive,
    },
    ref,
  ) {
    const historyActive = history.active
    const historyPreview = history.preview
    const mapPoints = mapPointProps.points
    const selectedMapPointId = mapPointProps.selectedId
    const hiddenMapPointCategories = mapPointProps.hiddenCategories
    const onCameraSettled = mapPointProps.onCameraSettled

    const styleReloadCameraRef = useRef<CameraSnapshot | null>(null)
    const previousMapStyleKeyRef = useRef(styleProps.mapStyleKey)
    const mapRevealedRef = useRef(false)
    const mapViewRef = useRef<ElementRef<typeof Mapbox.MapView> | null>(null)
    const gestureActiveRef = useRef(false)
    const [mapOpacity] = useState(() => new Animated.Value(0))
    const [cameraReady, setCameraReady] = useState(false)
    const [loadedStyleSignature, setLoadedStyleSignature] = useState<string | null>(null)
    const [selectedHistoryMarker, setSelectedHistoryMarker] =
      useState<SelectedHistoryMarker | null>(null)
    const [selectedLegalCountry, setSelectedLegalCountry] = useState<LegalLimitCountry | null>(null)
    const [cameraHeading, setCameraHeading] = useState(0)
    const [cameraZoom, setCameraZoom] = useState<number>(MAP_DEFAULTS.fallbackZoom)
    const [initialApproximateFix, setInitialApproximateFix] = useState<LocationEvent | null>(null)
    const [mapLayout, setMapLayout] = useState<MapLayout>({ width: 0, height: 0 })

    const mapStyle = useResolvedMapStyle({
      mapStyleKey: styleProps.mapStyleKey,
      mode,
      satelliteOverlayEnabled: styleProps.satelliteOverlayEnabled,
      satelliteImageryOpacity: styleProps.satelliteImageryOpacity,
      satelliteMapImageryOpacity: styleProps.satelliteMapImageryOpacity,
      satelliteImagerySaturation: styleProps.satelliteImagerySaturation,
      hideTelemetryMapDetails: styleProps.hideTelemetryMapDetails,
      loadedStyleSignature,
    })

    useEffect(() => {
      if (legalLimitsActive) return
      const frame = requestAnimationFrame(() => setSelectedLegalCountry(null))
      return () => cancelAnimationFrame(frame)
    }, [legalLimitsActive])

    const gpsFix = liveLocations.at(-1) ?? null
    const previousGpsFix = liveLocations.at(-2) ?? null
    const previousReliableBearing = useMemo(
      () => getReliableGpsBearingFromFixes(liveLocations.slice(0, -1)),
      [liveLocations],
    )
    const settingsLoaded = useSettingsStore((s) => s.loaded)
    const lastGpsLatitude = useSettingsStore((s) => s.lastGpsLatitude)
    const lastGpsLongitude = useSettingsStore((s) => s.lastGpsLongitude)
    const riderColor = useRiderStore((s) => s.riderColor)
    const historyMetricGradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
    const historyMetricHotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
    const persistedFallback = useMemo(
      () =>
        lastGpsLatitude != null && lastGpsLongitude != null
          ? ([lastGpsLongitude, lastGpsLatitude] as [number, number])
          : null,
      [lastGpsLatitude, lastGpsLongitude],
    )

    const gpsPresentation = useMemo(
      () =>
        getLiveGpsPresentation({
          preciseFix: gpsFix,
          previousPreciseFix: previousGpsFix,
          latestApproximateFix: latestApproximateLocation,
          initialApproximateFix,
          previousReliableBearing,
        }),
      [
        gpsFix,
        initialApproximateFix,
        latestApproximateLocation,
        previousGpsFix,
        previousReliableBearing,
      ],
    )
    const { cameraFix, accuracyFix, accuracyRadiusM, directionBearingDeg } = gpsPresentation
    const approximateGpsPuckActive =
      gpsPresentation.degraded ||
      (gpsFix == null && (latestApproximateLocation != null || initialApproximateFix != null))
    const offscreenMapGpsCoordinate = useMemo(
      () =>
        usableCoordinate(gpsFix) ??
        usableCoordinate(latestApproximateLocation) ??
        usableCoordinate(initialApproximateFix) ??
        usableCoordinate(accuracyFix) ??
        usableCoordinate(cameraFix),
      [accuracyFix, cameraFix, gpsFix, initialApproximateFix, latestApproximateLocation],
    )
    const selectedMapPoint = useMemo(
      () =>
        mapPoints.find(
          (point) =>
            point.id === selectedMapPointId &&
            isMapPinKindVisible(point.category, hiddenMapPointCategories),
        ) ?? null,
      [hiddenMapPointCategories, mapPoints, selectedMapPointId],
    )
    const retainedGpsBearing = gpsPresentation.nextReliableBearing
    const gpsHeadingMode = mapNavigationMode === 'gpsHeading'
    const phoneHeadingMode = mapNavigationMode === 'phoneHeading'
    const phoneHeadingDegRef = useRef<number | null>(null)
    const [phoneHeadingStatus, setPhoneHeadingStatus] = useState<PhoneHeadingStatus | 'idle'>(
      'idle',
    )
    const headingFollowMode = gpsHeadingMode || phoneHeadingMode
    useRenderRateWarning('MainMap')
    const followHeadingDeg = gpsHeadingMode
      ? (directionBearingDeg ?? 0)
      : phoneHeadingMode
        ? cameraHeading
        : 0
    const getFollowHeadingDeg = useCallback(
      () =>
        gpsHeadingMode
          ? (directionBearingDeg ?? 0)
          : phoneHeadingMode
            ? (phoneHeadingDegRef.current ?? cameraHeading)
            : 0,
      [cameraHeading, directionBearingDeg, gpsHeadingMode, phoneHeadingMode],
    )

    const rideRoute = useMemo(
      () =>
        history.gpsSamples.map((point) => [point.longitude, point.latitude] as [number, number]),
      [history.gpsSamples],
    )

    const getViewfinderCoordinateFromMap = useCallback(async () => {
      const mapView = mapViewRef.current
      if (!mapView || mapLayout.width <= 0 || mapLayout.height <= 0) return null

      const coordinate = await mapView.getCoordinateFromView([
        mapLayout.width / 2,
        mapLayout.height / 2,
      ])
      const [longitude, latitude] = coordinate
      if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
      return { longitude, latitude }
    }, [mapLayout.height, mapLayout.width])

    const {
      cameraRef,
      currentCameraRef,
      gpsCamera,
      followGps,
      setFollowGps,
      stopCameraAnimation,
      setFollowZoomLevel,
      recenterLive,
      getLiveFollowCamera,
      getHistoryPreviewCamera,
      phoneHeadingCameraSuspended,
    } = useCameraControls({
      ref,
      cameraFix,
      persistedFallback,
      perspectiveEnabled,
      mapViewport: mapLayout,
      mapNavigationMode,
      heading: {
        gpsMode: headingFollowMode,
        phoneMode: phoneHeadingMode,
        phoneReady: phoneHeadingStatus === 'ready',
        getFollowDeg: getFollowHeadingDeg,
        resetOnRecenter: mapNavigationMode !== 'freeRotate',
      },
      history: {
        active: historyActive,
        selectionKey: history.selectionKey,
        preview: historyPreview,
        previewRoute: history.previewRoute,
        rideRoute,
      },
      follow: {
        updatesEnabled: !(phoneHeadingMode && mode === 'map'),
        animationDuration: headingFollowMode
          ? phoneHeadingAnimationDuration()
          : MAP_DEFAULTS.followAnimationDuration,
      },
      getViewfinderCoordinateFromMap,
      onHeadingChange,
      onPerspectiveChange,
    })
    const gpsPuckBearingDeg = getGpsPuckBearing({
      navigationMode: mapNavigationMode,
      approximateFix: approximateGpsPuckActive,
      phoneHeadingDeg: null,
      gpsBearingDeg: directionBearingDeg,
    })
    const displayedCameraHeading = followGps && headingFollowMode ? followHeadingDeg : cameraHeading
    const gpsPinBearingDeg =
      gpsPuckBearingDeg == null ? null : gpsPuckBearingDeg - displayedCameraHeading
    const updateNavigationDiagnostics = useNavigationDiagnosticsStore((s) => s.update)
    const riderFocusRequest = useGroupRideStore((s) => s.focusRequest)
    const focusRider = useGroupRideStore((s) => s.focusRider)
    const handledRiderFocusNonceRef = useRef(0)
    const riderFocusRows = useGroupRideStore((s) => s.rosterRows)
    // Own Rider is drawn by the GPS puck, so keep it out of the roster map pins.
    const mapRiders = useMemo(() => riderFocusRows.filter((row) => !row.isSelf), [riderFocusRows])
    const riderTargetPoints = useMemo(() => buildRiderTargetPoints(mapRiders), [mapRiders])
    const riderPoints = useMemo(() => buildRiderPoints(mapRiders), [mapRiders])
    const activeNavigationPoint = useMemo(
      () =>
        buildActiveNavigationPoint({
          activeNavigationTarget,
          directionPoint,
          mapPoints,
          riderColor,
        }),
      [activeNavigationTarget, directionPoint, mapPoints, riderColor],
    )

    const trackedMapPoints = useMemo(
      () => [
        ...buildGpsTrackedPoint(offscreenMapGpsCoordinate, riderColor),
        ...(activeNavigationPoint ? [activeNavigationPoint] : []),
        ...(selectedMapPoint &&
        activeNavigationPoint?.id !== `navigation-map-point-${selectedMapPoint.id}`
          ? [buildMapPointTrackedPoint(selectedMapPoint, `map-point-${selectedMapPoint.id}`)]
          : []),
        ...riderTargetPoints,
        ...riderPoints,
      ],
      [
        activeNavigationPoint,
        offscreenMapGpsCoordinate,
        riderColor,
        riderPoints,
        riderTargetPoints,
        selectedMapPoint,
      ],
    )

    const {
      indicators: offscreenMapIndicators,
      update: updateOffscreenMapIndicators,
      scheduleRefresh: scheduleOffscreenMapIndicatorRefresh,
      repositionForCamera: repositionOffscreenIndicatorsForCamera,
    } = useOffscreenMapIndicators({
      mapViewRef,
      currentCameraRef,
      mapLayout,
      trackedPoints: trackedMapPoints,
      enabled: !historyActive,
    })

    const handleMapLayout = useCallback((event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout
      setMapLayout((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      )
    }, [])

    useEffect(() => {
      if (!riderFocusRequest || historyActive) return
      // One camera move per request: rosterRows refresh on every presence tick, so
      // without consuming the nonce this effect would keep re-centering on the rider.
      if (riderFocusRequest.nonce === handledRiderFocusNonceRef.current) return
      const rider = riderFocusRows.find((row) => row.id === riderFocusRequest.riderId)
      if (!rider?.presence) return
      handledRiderFocusNonceRef.current = riderFocusRequest.nonce
      setFollowGps(false)
      panPreservingCamera(cameraRef, currentCameraRef, [rider.presence.lng, rider.presence.lat], {
        minZoomLevel: RIDER_FOCUS_MIN_ZOOM,
      })
    }, [
      cameraRef,
      currentCameraRef,
      historyActive,
      riderFocusRequest,
      riderFocusRows,
      setFollowGps,
    ])

    const handlePhoneHeadingChange = useCallback(
      (headingDeg: number | null) => {
        phoneHeadingDegRef.current = headingDeg
        onPhoneHeadingChange(headingDeg)

        if (headingDeg == null || !phoneHeadingMode || !followGps) return
        const currentCamera = currentCameraRef.current
        if (!currentCamera) return

        repositionOffscreenIndicatorsForCamera({ ...currentCamera, heading: headingDeg })
        scheduleOffscreenMapIndicatorRefresh()
      },
      [
        currentCameraRef,
        followGps,
        onPhoneHeadingChange,
        phoneHeadingMode,
        repositionOffscreenIndicatorsForCamera,
        scheduleOffscreenMapIndicatorRefresh,
      ],
    )

    const handleOffscreenIndicatorPress = useCallback(
      (indicator: OffscreenMapIndicatorState) => {
        onMapInteraction()
        if (indicator.id === 'gps') {
          recenterLive({ resetPadding: true })
          return
        }
        if (indicator.type === 'rider') {
          // Same focus flow as tapping a rider in the roster (centers with min zoom).
          focusRider(indicator.id.slice('rider-'.length))
          return
        }
        if (indicator.type === 'direction' && !directionPoint) return
        if (indicator.type === 'mapPoint') onEnterMapMode()

        setFollowGps(false)
        panPreservingCamera(
          cameraRef,
          currentCameraRef,
          indicator.type === 'direction' && directionPoint
            ? [directionPoint.longitude, directionPoint.latitude]
            : indicator.coordinate.value,
        )
      },
      [
        cameraRef,
        currentCameraRef,
        directionPoint,
        focusRider,
        onEnterMapMode,
        onMapInteraction,
        recenterLive,
        setFollowGps,
      ],
    )

    const handleFocusDirectionPoint = useCallback(() => {
      if (!directionPoint) return
      onMapInteraction()
      setFollowGps(false)
      panPreservingCamera(cameraRef, currentCameraRef, [
        directionPoint.longitude,
        directionPoint.latitude,
      ])
    }, [cameraRef, currentCameraRef, directionPoint, onMapInteraction, setFollowGps])

    useEffect(() => {
      updateNavigationDiagnostics({
        gpsFix,
        retainedGpsBearingDeg: retainedGpsBearing?.bearingDeg ?? null,
        retainedGpsBearingAt: retainedGpsBearing?.sourceTimestamp ?? null,
        phoneHeadingDeg: phoneHeadingDegRef.current,
        phoneHeadingStatus,
        activeDisplayHeadingDeg: gpsPinBearingDeg,
        cameraHeadingDeg: displayedCameraHeading,
        fallbackReason: getNavigationFallbackReason({
          mapNavigationMode,
          gpsFix,
          retainedGpsBearingDeg: retainedGpsBearing?.bearingDeg ?? null,
          phoneHeadingDeg: phoneHeadingDegRef.current,
          phoneHeadingStatus,
        }),
      })
    }, [
      displayedCameraHeading,
      gpsFix,
      gpsPinBearingDeg,
      mapNavigationMode,
      phoneHeadingStatus,
      retainedGpsBearing?.bearingDeg,
      retainedGpsBearing?.sourceTimestamp,
      updateNavigationDiagnostics,
    ])

    useEffect(() => {
      if (previousMapStyleKeyRef.current === styleProps.mapStyleKey) return
      previousMapStyleKeyRef.current = styleProps.mapStyleKey
      styleReloadCameraRef.current = currentCameraRef.current
    }, [currentCameraRef, styleProps.mapStyleKey])

    useEffect(() => {
      const frame = requestAnimationFrame(() => {
        setInitialApproximateFix(gpsPresentation.nextInitialApproximateFix)
      })
      return () => cancelAnimationFrame(frame)
    }, [gpsPresentation.nextInitialApproximateFix])

    useEffect(() => {
      if (mapRevealedRef.current) return
      mapOpacity.setValue(0)
      setCameraReady(false)
    }, [gpsCamera.centerCoordinate, mapOpacity])

    useEffect(() => {
      if (!settingsLoaded || !cameraReady) return
      Animated.timing(mapOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        mapRevealedRef.current = true
      })
    }, [cameraReady, mapOpacity, settingsLoaded])

    const accuracyShape = useMemo(
      () =>
        accuracyFix && accuracyRadiusM != null
          ? makeCircleFeature(accuracyFix.longitude, accuracyFix.latitude, accuracyRadiusM)
          : null,
      [accuracyFix, accuracyRadiusM],
    )

    const liveTrailShape = useMemo(
      () => (liveLocations.length >= 2 ? makeTrailLineString(liveLocations) : null),
      [liveLocations],
    )

    const rideRouteShape = useMemo(
      () =>
        rideRoute.length > 1
          ? ({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: rideRoute },
              properties: {},
            } as const)
          : null,
      [rideRoute],
    )

    const handleMapLoaded = useCallback(() => {
      setLoadedStyleSignature(mapStyle.styleSignature)
      const styleReloadCamera = styleReloadCameraRef.current
      styleReloadCameraRef.current = null
      if (styleReloadCamera && gestureActiveRef.current) return
      const camera =
        historyActive && historyPreview
          ? getHistoryPreviewCamera(historyPreview)
          : (styleReloadCamera ?? getLiveFollowCamera())
      const initialHeading =
        'heading' in camera && typeof camera.heading === 'number'
          ? camera.heading
          : historyActive
            ? 0
            : followHeadingDeg
      cameraRef.current?.setCamera({
        ...camera,
        heading: initialHeading,
        pitch: styleReloadCamera
          ? styleReloadCamera.pitch
          : getPitchForZoom(camera.zoomLevel, perspectiveEnabled),
        animationDuration: 0,
      })
    }, [
      cameraRef,
      followHeadingDeg,
      getHistoryPreviewCamera,
      getLiveFollowCamera,
      historyActive,
      historyPreview,
      mapStyle.styleSignature,
      perspectiveEnabled,
    ])

    const { handleMapPress, handleLongPress, suppressNextMapPress } = useMapPressHandlers({
      mapViewRef,
      enabled: mode === 'map' && !historyActive,
      onRawMapPress,
      onMapPress,
      onMapInteraction,
      onLongPressTarget,
    })

    const handleTouchStart = useCallback(() => {
      onMapInteraction()
      stopCameraAnimation()
    }, [onMapInteraction, stopCameraAnimation])

    useEffect(() => {
      if (mode === 'telemetry') {
        onOffscreenMapIndicatorsChange(offscreenMapIndicators)
      }
    }, [mode, offscreenMapIndicators, onOffscreenMapIndicatorsChange])

    const mediaAssetCount = history.mediaAssets.length
    const handleCameraChanged = useCallback(
      (state: {
        properties: { center: number[]; zoom: number; heading: number; pitch: number }
        gestures: { isGestureActive: boolean }
      }) => {
        gestureActiveRef.current = state.gestures.isGestureActive
        const [longitude, latitude] = state.properties.center
        const automaticHeadingFollow =
          followGps && headingFollowMode && !state.gestures.isGestureActive
        const camera = {
          centerCoordinate: [longitude, latitude],
          zoomLevel: state.properties.zoom,
          heading: state.properties.heading,
          pitch: state.properties.pitch,
        } satisfies CameraSnapshot
        currentCameraRef.current = camera
        repositionOffscreenIndicatorsForCamera(camera)
        const [targetLongitude, targetLatitude] = gpsCamera.centerCoordinate
        if (
          Math.abs(longitude - targetLongitude) < 0.0001 &&
          Math.abs(latitude - targetLatitude) < 0.0001
        ) {
          setCameraReady(true)
        }
        if (mode === 'map' && !(followGps && headingFollowMode)) {
          const pitch = getPitchForZoom(state.properties.zoom, perspectiveEnabled)
          if (Math.abs(state.properties.pitch - pitch) > 0.5) {
            cameraRef.current?.setCameraDirect({ pitch })
          }
        }
        if (state.gestures.isGestureActive) {
          const gestureCenterDistanceM = cameraFix
            ? distanceMeters({ longitude, latitude }, cameraFix)
            : Number.POSITIVE_INFINITY
          const preservesLiveFollow = shouldPreserveLiveFollowGesture({
            followGps,
            historyActive,
            centerDistanceM: gestureCenterDistanceM,
            headingDeg: state.properties.heading,
            followHeadingDeg,
          })
          if (preservesLiveFollow) {
            setFollowZoomLevel(state.properties.zoom)
            const followCamera = getLiveFollowCameraProfile({
              gpsCamera: {
                centerCoordinate: [longitude, latitude],
                zoomLevel: state.properties.zoom,
              },
              followHeadingDeg,
              gpsHeadingMode: headingFollowMode,
              profileKey: phoneHeadingMode ? 'compass' : undefined,
              perspectiveEnabled,
            })
            if (Math.abs(state.properties.pitch - followCamera.pitch) > 0.5) {
              cameraRef.current?.setCameraDirect({ pitch: followCamera.pitch })
            }
          } else {
            setFollowGps(false)
          }
        }
        if (!automaticHeadingFollow) {
          onHeadingChange(state.properties.heading)
          updateOffscreenMapIndicators()
        }
        if (historyActive && mediaAssetCount > 0) {
          setCameraZoom((current) =>
            Math.abs(current - state.properties.zoom) > 0.25 ? state.properties.zoom : current,
          )
        }
      },
      [
        cameraRef,
        cameraFix,
        currentCameraRef,
        followGps,
        followHeadingDeg,
        gpsCamera.centerCoordinate,
        headingFollowMode,
        historyActive,
        mode,
        onHeadingChange,
        mediaAssetCount,
        perspectiveEnabled,
        phoneHeadingMode,
        repositionOffscreenIndicatorsForCamera,
        setFollowGps,
        setFollowZoomLevel,
        updateOffscreenMapIndicators,
      ],
    )

    const handleMapIdle = useCallback(() => {
      const camera = currentCameraRef.current
      const heading = camera?.heading
      if (heading != null) setCameraHeading(heading)
      scheduleOffscreenMapIndicatorRefresh()
      // Map Points live on the server, so the visible set is read per camera rest. The handler
      // drops the call when the camera has not moved far enough to reveal anything new.
      if (camera) {
        const [longitude, latitude] = camera.centerCoordinate
        onCameraSettled(latitude, longitude, camera.zoomLevel)
      }
    }, [currentCameraRef, onCameraSettled, scheduleOffscreenMapIndicatorRefresh])

    const handleSelectLegalCountry = useCallback(
      (country: LegalLimitCountry) => {
        if (legalLimitsActive) setSelectedLegalCountry(country)
      },
      [legalLimitsActive],
    )

    if (!MAPBOX_ACCESS_TOKEN) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Map unavailable</Text>
          <Text style={styles.emptyText}>
            Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and rebuild the app.
          </Text>
        </View>
      )
    }

    if (!settingsLoaded) {
      return <View style={styles.mapContainer} />
    }

    return (
      <Animated.View
        style={[styles.mapContainer, { opacity: mapOpacity }]}
        onLayout={handleMapLayout}
        onTouchStart={handleTouchStart}
      >
        <Mapbox.MapView
          ref={mapViewRef}
          style={styles.map}
          styleURL={mapStyle.styleURL}
          styleJSON={mapStyle.styleJSON}
          pitchEnabled={false}
          rotateEnabled={!rotationLocked}
          compassEnabled={false}
          scaleBarEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          onDidFinishLoadingMap={handleMapLoaded}
          onPress={handleMapPress}
          onLongPress={handleLongPress}
          onMapIdle={handleMapIdle}
          onCameraChanged={handleCameraChanged}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              ...getLiveFollowCamera(),
            }}
            maxZoomLevel={MAP_DEFAULTS.maxZoom}
            animationMode="easeTo"
          />
          <MapBaseStyleLayers
            enabled={mapStyle.canUpdateExistingStyleLayers}
            styleKey={mapStyle.styleKey}
            isOneDark={mapStyle.isOneDark}
            isSatellite={mapStyle.isSatellite}
            isSatelliteOverlay={mapStyle.isSatelliteOverlay}
            mapDetailsVisible={mapStyle.mapDetailsVisible}
            satelliteImageryPaint={mapStyle.satelliteImageryPaint}
            satelliteRoadLineOpacity={mapStyle.satelliteRoadLineOpacity}
          />
          <PhoneHeadingMapLayer
            active={!historyActive && !gpsHeadingMode}
            followCamera={phoneHeadingMode && followGps && !phoneHeadingCameraSuspended}
            approximateFix={approximateGpsPuckActive}
            coordinate={accuracyFix}
            cameraRef={cameraRef}
            currentCameraRef={currentCameraRef}
            onHeadingChange={handlePhoneHeadingChange}
            onStatusChange={setPhoneHeadingStatus}
          />
          <MainMapLayers
            historyActive={historyActive}
            expandSelectedMapPoints={mode === 'map'}
            isMapy={mapStyle.isMapy}
            isOneDark={mapStyle.isOneDark}
            isSatellite={mapStyle.isSatelliteOverlay}
            showBuildings3d={mapStyle.showBuildings3d}
            weatherActive={weatherActive}
            legalLimitsActive={legalLimitsActive}
            liveTrailShape={liveTrailShape}
            rideRouteShape={rideRouteShape}
            accuracyFix={accuracyFix}
            accuracyShape={accuracyShape}
            gpsPuckBearingDeg={gpsPuckBearingDeg}
            riders={mapRiders}
            rideRoute={rideRoute}
            rideTelemetrySamples={history.telemetrySamples}
            activeHistoryMapMetric={history.activeMapMetric}
            rideMarkers={history.markers}
            rideGpsSamples={history.gpsSamples}
            mediaAssets={history.mediaAssets}
            mapZoom={cameraZoom}
            historyMetricGradientsEnabled={historyMetricGradientsEnabled}
            historyMetricHotRanges={historyMetricHotRanges}
            directionPoint={directionPoint}
            activeNavigationTarget={activeNavigationTarget}
            selectedNavigationTarget={selectedNavigationTarget}
            mapPoints={mapPoints}
            selectedMapPointId={selectedMapPointId}
            hiddenMapPointCategories={hiddenMapPointCategories}
            onToggleMapPointSelection={mapPointProps.onToggleSelection}
            onSuppressNextMapPress={suppressNextMapPress}
            onSelectMarker={setSelectedHistoryMarker}
            onOpenMedia={history.onOpenMedia}
            onSelectLegalCountry={handleSelectLegalCountry}
            onFocusDirectionPoint={handleFocusDirectionPoint}
          />
        </Mapbox.MapView>
        <InfoModal
          visible={selectedHistoryMarker != null}
          title={
            selectedHistoryMarker
              ? HISTORY_MARKER_LABELS[selectedHistoryMarker.marker.type]
              : 'History marker'
          }
          message={selectedHistoryMarker ? buildHistoryMarkerMessage(selectedHistoryMarker) : ''}
          dismissLabel="Close"
          onDismiss={() => setSelectedHistoryMarker(null)}
        />
        <LegalLimitCountrySheet
          country={legalLimitsActive ? selectedLegalCountry : null}
          onClose={() => setSelectedLegalCountry(null)}
        />
        {weatherActive ? (
          <Text style={styles.radarAttribution} pointerEvents="none">
            Weather data by RainViewer
          </Text>
        ) : null}
        {mode !== 'telemetry'
          ? offscreenMapIndicators.map((indicator) => (
              <OffscreenMapIndicator
                key={indicator.id}
                indicator={indicator}
                onPress={() => handleOffscreenIndicatorPress(indicator)}
              />
            ))
          : null}
        <View style={styles.edgeGuardLeft} pointerEvents="box-only" />
        <View style={styles.edgeGuardRight} pointerEvents="box-only" />
      </Animated.View>
    )
  }),
)

const EDGE_GUARD_WIDTH = 40

const styles = StyleSheet.create({
  mapContainer: {
    ...StyleSheet.absoluteFill,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  edgeGuardLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: EDGE_GUARD_WIDTH,
    backgroundColor: theme.alpha(theme.palette.mono.black, 0),
    zIndex: 3,
  },
  edgeGuardRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: EDGE_GUARD_WIDTH,
    backgroundColor: theme.alpha(theme.palette.mono.black, 0),
    zIndex: 3,
  },
  emptyContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.bg,
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  radarAttribution: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    color: theme.alpha(theme.palette.mono.white, 0.6),
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: theme.alpha(theme.palette.mono.black, 0.3),
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
})

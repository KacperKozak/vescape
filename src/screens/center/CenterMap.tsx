import Mapbox, { Camera } from '@rnmapbox/maps'
import { CrosshairSimpleIcon } from 'phosphor-react-native'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from 'react'
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import type { LocationEvent, MapPoint, MapPointKind } from 'vesc-ble'

import { InfoModal } from '@/components/ui/modals/InfoModal'
import { IS_MAPY_CONFIGURED, MAPBOX_ACCESS_TOKEN } from '@/config/mapy'
import {
  BLANK_STYLE,
  MAP_DEFAULTS,
  MAP_STYLES,
  type MapNavigationMode,
  type MapStyleKey,
} from '@/constants/mapStyles'
import { getMapPointKindIcon } from '@/constants/mapPointIcons'
import { getMapPointKindColor, getMapPointKindTextColor } from '@/constants/mapPoints'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { theme } from '@/constants/theme'
import {
  getLiveGpsPresentation,
  getReliableGpsBearingFromFixes,
} from '@/helpers/liveGpsPresentation'
import { distanceMeters, makeCircleFeature, makeTrailLineString } from '@/helpers/mapGeometry'
import type { MediaHistoryAsset } from '@/lib/history/mediaHistory'
import { isMapPointKindVisible } from '@/lib/mapPointVisibility'
import type { HistoryMetricKey } from '@/lib/history/metricColorScale'
import { getNavigationFallbackReason } from '@/lib/map/navigationDiagnostics'
import type { HistoryGpsSample, HistoryMarker, TelemetrySample } from '@/store/historyStore'
import { useGroupRideStore } from '@/store/groupRideStore'
import { useNavigationDiagnosticsStore } from '@/store/navigationDiagnosticsStore'
import { useSettingsStore } from '@/store/settingsStore'

import type { CenterViewState } from './centerViewState'
import {
  type CameraSnapshot,
  type HistoryPreviewTarget,
  useCameraControls,
} from './useCameraControls'
import { getLiveFollowCameraProfile, getPitchForZoom } from './cameraFollowProfile'
import { shouldPreserveLiveFollowGesture } from './cameraGestureState'
import { phoneHeadingAnimationDuration } from './phoneHeading'
import { usePhoneHeading } from './usePhoneHeading'
import { CenterMapLayers } from './CenterMapLayers'
import {
  DESTINATION_POINT_COLOR,
  DESTINATION_POINT_TEXT_COLOR,
  GPS_POINT_COLOR,
  GPS_POINT_TEXT_COLOR,
  OffscreenMapIndicator,
  applyOffscreenIndicatorDrafts,
  clampedEdgeIndicator,
  projectCoordinateToEdgePoint,
  repositionOffscreenMapIndicators,
  type OffscreenMapIndicatorDraft,
  type OffscreenMapIndicatorState,
} from './offscreenMapIndicators'
import {
  HISTORY_MARKER_LABELS,
  buildHistoryMarkerMessage,
  type SelectedHistoryMarker,
} from './historyMapMarkerInfo'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

export interface CenterMapHandle {
  recenterLive: (options?: { resetPadding?: boolean; animationDuration?: number }) => void
  previewHistorySession: (preview: HistoryPreviewTarget) => void
  beginPreviewPan: () => void
  previewPanBy: (
    deltaX: number,
    deltaY: number,
    animationDuration?: number,
    revealProgress?: number,
  ) => void
  beginPreviewZoom: () => void
  previewZoomBy: (scale: number) => void
  endPreviewZoom: () => void
  restorePreviewPan: () => void
  resetRotation: () => void
  togglePerspective: () => void
  setPadding: (bottom: number) => void
  zoomBy: (delta: number) => void
  zoomToLevel: (zoom: number) => void
  focusCoordinate: (coordinate: [number, number]) => void
  getViewfinderCoordinate: () => Promise<{ latitude: number; longitude: number }>
}

const HEADING_SMOOTHING_TAU_MS = 180
const HEADING_SNAP_DEG = 0.08
interface MapLayout {
  width: number
  height: number
}

function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function headingDeltaDeg(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

function smoothHeadingStep(current: number, target: number, elapsedMs: number): number {
  const delta = headingDeltaDeg(current, target)
  if (Math.abs(delta) <= HEADING_SNAP_DEG) return normalizeHeading(target)
  const alpha = 1 - Math.exp(-elapsedMs / HEADING_SMOOTHING_TAU_MS)
  return normalizeHeading(current + delta * alpha)
}

function usableCoordinate(location: { longitude: number; latitude: number } | null | undefined) {
  if (!location) return null
  if (!Number.isFinite(location.longitude) || !Number.isFinite(location.latitude)) return null
  return {
    longitude: location.longitude,
    latitude: location.latitude,
  }
}

interface CenterMapProps {
  mode: CenterViewState
  liveLocations: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
  rideGpsSamples: HistoryGpsSample[]
  rideTelemetrySamples: TelemetrySample[]
  rideMarkers: HistoryMarker[]
  mediaAssets: MediaHistoryAsset[]
  onOpenMedia: (asset: MediaHistoryAsset) => void
  activeHistoryMapMetric: HistoryMetricKey
  historyActive: boolean
  mapStyleKey: MapStyleKey
  mapNavigationMode: MapNavigationMode
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onLongPressTarget: (target: { latitude: number; longitude: number }) => void
  onMapInteraction: () => void
  onMapPress: () => void
  onEnterMapMode: () => void
  onOffscreenMapIndicatorsChange: (indicators: OffscreenMapIndicatorState[]) => void
  directionPoint: MapPoint | null
  mapPoints: MapPoint[]
  selectedMapPointId: string | null
  hiddenMapPointKinds: MapPointKind[]
  onToggleMapPointSelection: (id: string) => void
  onRemoveMapPoint: (id: string) => void
  onClearDirectionPoint: () => void
  weatherActive: boolean
  historyPreview:
    | ({
        key: string
      } & HistoryPreviewTarget)
    | null
}

export const CenterMap = forwardRef<CenterMapHandle, CenterMapProps>(function CenterMap(
  {
    mode,
    liveLocations,
    latestApproximateLocation,
    rideGpsSamples,
    rideTelemetrySamples,
    rideMarkers,
    mediaAssets,
    onOpenMedia,
    activeHistoryMapMetric,
    historyActive,
    mapStyleKey,
    mapNavigationMode,
    rotationLocked,
    perspectiveEnabled,
    onPerspectiveChange,
    onHeadingChange,
    onLongPressTarget,
    onMapInteraction,
    onMapPress,
    onEnterMapMode,
    onOffscreenMapIndicatorsChange,
    directionPoint,
    mapPoints,
    selectedMapPointId,
    hiddenMapPointKinds,
    onToggleMapPointSelection,
    onRemoveMapPoint,
    weatherActive,
    onClearDirectionPoint,
    historyPreview,
  },
  ref,
) {
  const styleReloadCameraRef = useRef<CameraSnapshot | null>(null)
  const previousMapStyleKeyRef = useRef(mapStyleKey)
  const mapRevealedRef = useRef(false)
  const mapViewRef = useRef<ElementRef<typeof Mapbox.MapView> | null>(null)
  const offscreenProjectionRequestRef = useRef(0)
  const suppressNextMapPressRef = useRef(false)
  const suppressNextMapPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapOpacity] = useState(() => new Animated.Value(0))
  const [cameraReady, setCameraReady] = useState(false)
  const [selectedHistoryMarker, setSelectedHistoryMarker] = useState<SelectedHistoryMarker | null>(
    null,
  )
  const [cameraHeading, setCameraHeading] = useState(0)
  const [cameraZoom, setCameraZoom] = useState<number>(MAP_DEFAULTS.fallbackZoom)
  const [initialApproximateFix, setInitialApproximateFix] = useState<LocationEvent | null>(null)
  const [mapLayout, setMapLayout] = useState<MapLayout>({ width: 0, height: 0 })
  const [offscreenMapIndicators, setOffscreenMapIndicators] = useState<
    OffscreenMapIndicatorState[]
  >([])
  const offscreenMapIndicatorsRef = useRef<OffscreenMapIndicatorState[]>([])

  const publishOffscreenMapIndicators = useCallback((next: OffscreenMapIndicatorState[]) => {
    offscreenMapIndicatorsRef.current = next
    setOffscreenMapIndicators(next)
  }, [])

  const applyOffscreenMapIndicatorDrafts = useCallback(
    (drafts: OffscreenMapIndicatorDraft[]) => {
      const current = offscreenMapIndicatorsRef.current
      const next = applyOffscreenIndicatorDrafts(current, drafts)
      if (next !== current) {
        publishOffscreenMapIndicators(next)
      }
    },
    [publishOffscreenMapIndicators],
  )

  const clearOffscreenMapIndicators = useCallback(() => {
    if (offscreenMapIndicatorsRef.current.length === 0) return
    publishOffscreenMapIndicators([])
  }, [publishOffscreenMapIndicators])

  const gpsFix = liveLocations.at(-1) ?? null
  const previousGpsFix = liveLocations.at(-2) ?? null
  const previousReliableBearing = useMemo(
    () => getReliableGpsBearingFromFixes(liveLocations.slice(0, -1)),
    [liveLocations],
  )
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const lastGpsLatitude = useSettingsStore((s) => s.lastGpsLatitude)
  const lastGpsLongitude = useSettingsStore((s) => s.lastGpsLongitude)
  const historyMetricGradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const historyMetricHotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const persistedFallback = useMemo(
    () =>
      lastGpsLatitude != null && lastGpsLongitude != null
        ? ([lastGpsLongitude, lastGpsLatitude] as [number, number])
        : null,
    [lastGpsLatitude, lastGpsLongitude],
  )
  const requestedMapStyle = MAP_STYLES.find((style) => style.key === mapStyleKey) ?? MAP_STYLES[0]
  const selectedMapStyle =
    requestedMapStyle.key === 'mapy' && !IS_MAPY_CONFIGURED ? MAP_STYLES[0] : requestedMapStyle
  const isMapy = selectedMapStyle.key === 'mapy'
  const isOneDark = selectedMapStyle.key === 'onedark'
  const useCustomJSON = isMapy || isOneDark
  const showBuildings3d = selectedMapStyle.key === 'outdoors' || selectedMapStyle.key === 'onedark'

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
          point.kind !== 'direction' &&
          point.id === selectedMapPointId &&
          isMapPointKindVisible(point.kind, hiddenMapPointKinds),
      ) ?? null,
    [hiddenMapPointKinds, mapPoints, selectedMapPointId],
  )
  const retainedGpsBearing = gpsPresentation.nextReliableBearing
  const gpsHeadingMode = mapNavigationMode === 'gpsHeading'
  const phoneHeadingMode = mapNavigationMode === 'phoneHeading'
  const phoneHeading = usePhoneHeading(
    (phoneHeadingMode || approximateGpsPuckActive) && !historyActive,
  )
  const headingFollowMode = gpsHeadingMode || phoneHeadingMode
  const phoneHeadingDeg = phoneHeading.headingDeg
  const targetFollowHeadingDeg = gpsHeadingMode
    ? (directionBearingDeg ?? 0)
    : phoneHeadingMode
      ? (phoneHeadingDeg ?? 0)
      : 0
  const [smoothedFollowHeadingDeg, setSmoothedFollowHeadingDeg] = useState(targetFollowHeadingDeg)
  const smoothingFrameRef = useRef<number | null>(null)
  const smoothingTimestampRef = useRef<number | null>(null)
  const smoothingHeadingRef = useRef(targetFollowHeadingDeg)
  const followHeadingDeg = headingFollowMode ? smoothedFollowHeadingDeg : targetFollowHeadingDeg

  useEffect(() => {
    if (!headingFollowMode || historyActive) {
      smoothingHeadingRef.current = targetFollowHeadingDeg
      const frame = requestAnimationFrame(() => setSmoothedFollowHeadingDeg(targetFollowHeadingDeg))
      return () => cancelAnimationFrame(frame)
    }

    const tick = (timestamp: number) => {
      const previousTimestamp = smoothingTimestampRef.current ?? timestamp
      smoothingTimestampRef.current = timestamp
      const nextHeading = smoothHeadingStep(
        smoothingHeadingRef.current,
        targetFollowHeadingDeg,
        timestamp - previousTimestamp,
      )
      smoothingHeadingRef.current = nextHeading
      setSmoothedFollowHeadingDeg(nextHeading)
      if (nextHeading === normalizeHeading(targetFollowHeadingDeg)) {
        smoothingFrameRef.current = null
        smoothingTimestampRef.current = null
        return
      }
      smoothingFrameRef.current = requestAnimationFrame(tick)
    }

    smoothingTimestampRef.current = null
    smoothingFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (smoothingFrameRef.current != null) cancelAnimationFrame(smoothingFrameRef.current)
      smoothingFrameRef.current = null
      smoothingTimestampRef.current = null
    }
  }, [headingFollowMode, historyActive, targetFollowHeadingDeg])

  const rideRoute = useMemo(
    () => rideGpsSamples.map((point) => [point.longitude, point.latitude] as [number, number]),
    [rideGpsSamples],
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
    setFollowZoomLevel,
    recenterLive,
    getLiveFollowCamera,
    getHistoryPreviewCamera,
  } = useCameraControls({
    ref,
    cameraFix,
    persistedFallback,
    perspectiveEnabled,
    historyActive,
    historyPreview,
    rideRoute,
    mapViewport: mapLayout,
    gpsHeadingMode: headingFollowMode,
    phoneHeadingMode,
    phoneHeadingReady: phoneHeadingDeg != null,
    phoneHeadingOneShot: true,
    followHeadingDeg,
    resetHeadingOnRecenter: mapNavigationMode !== 'freeRotate',
    liveFollowUpdatesEnabled: !(phoneHeadingMode && mode === 'map'),
    followAnimationDuration: headingFollowMode
      ? phoneHeadingAnimationDuration()
      : MAP_DEFAULTS.followAnimationDuration,
    getViewfinderCoordinateFromMap,
    onHeadingChange,
    onPerspectiveChange,
  })
  const gpsPinBearingDeg =
    (phoneHeadingMode || approximateGpsPuckActive) && phoneHeadingDeg != null
      ? phoneHeadingDeg - cameraHeading
      : directionBearingDeg == null
        ? null
        : directionBearingDeg - cameraHeading
  const gpsPuckBearingDeg =
    (phoneHeadingMode || approximateGpsPuckActive) && phoneHeadingDeg != null
      ? phoneHeadingDeg
      : directionBearingDeg
  const updateNavigationDiagnostics = useNavigationDiagnosticsStore((s) => s.update)
  const riderFocusRequest = useGroupRideStore((s) => s.focusRequest)
  const riderFocusRows = useGroupRideStore((s) => s.rosterRows)

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
    const rider = riderFocusRows.find((row) => row.id === riderFocusRequest.riderId)
    if (!rider?.presence) return
    setFollowGps(false)
    const current = currentCameraRef.current
    cameraRef.current?.setCamera({
      centerCoordinate: [rider.presence.lng, rider.presence.lat],
      zoomLevel: Math.max(current?.zoomLevel ?? MAP_DEFAULTS.persistedGpsFallbackZoom, 15),
      heading: current?.heading,
      pitch: current?.pitch,
      animationDuration: MAP_DEFAULTS.animationDuration,
      animationMode: 'easeTo',
    })
  }, [cameraRef, currentCameraRef, historyActive, riderFocusRequest, riderFocusRows, setFollowGps])

  const updateOffscreenMapIndicators = useCallback(() => {
    const camera = currentCameraRef.current
    const mapView = mapViewRef.current
    if (
      mapView == null ||
      historyActive ||
      (offscreenMapGpsCoordinate == null && directionPoint == null && selectedMapPoint == null) ||
      mapLayout.width <= 0 ||
      mapLayout.height <= 0
    ) {
      offscreenProjectionRequestRef.current += 1
      clearOffscreenMapIndicators()
      return
    }

    const requestId = offscreenProjectionRequestRef.current + 1
    offscreenProjectionRequestRef.current = requestId
    const trackedPoints = [
      ...(offscreenMapGpsCoordinate
        ? [
            {
              id: 'gps',
              type: 'gps' as const,
              coordinate: [
                offscreenMapGpsCoordinate.longitude,
                offscreenMapGpsCoordinate.latitude,
              ] as [number, number],
              color: GPS_POINT_COLOR,
              textColor: GPS_POINT_TEXT_COLOR,
              icon: CrosshairSimpleIcon,
            },
          ]
        : []),
      ...(directionPoint
        ? [
            {
              id: 'direction',
              type: 'direction' as const,
              coordinate: [directionPoint.longitude, directionPoint.latitude] as [number, number],
              color: DESTINATION_POINT_COLOR,
              textColor: DESTINATION_POINT_TEXT_COLOR,
              icon: getMapPointKindIcon('direction'),
            },
          ]
        : []),
      ...(selectedMapPoint
        ? [
            {
              id: `map-point-${selectedMapPoint.id}`,
              type: 'mapPoint' as const,
              coordinate: [selectedMapPoint.longitude, selectedMapPoint.latitude] as [
                number,
                number,
              ],
              color: getMapPointKindColor(selectedMapPoint.kind),
              textColor: getMapPointKindTextColor(selectedMapPoint.kind),
              icon: getMapPointKindIcon(selectedMapPoint.kind),
            },
          ]
        : []),
    ]

    void Promise.all(
      trackedPoints.map(async (trackedPoint) => ({
        ...trackedPoint,
        point: await mapView.getPointInView(trackedPoint.coordinate),
      })),
    )
      .then((projectedPoints) => {
        if (offscreenProjectionRequestRef.current !== requestId) return
        const next = projectedPoints.flatMap((trackedPoint) => {
          const [x, y] = trackedPoint.point
          if (typeof x !== 'number' || typeof y !== 'number') return []

          const detectedIndicator = clampedEdgeIndicator(trackedPoint, { x, y }, mapLayout)
          if (!detectedIndicator) return []
          if (!camera) return [detectedIndicator]

          const positionedPoint = projectCoordinateToEdgePoint(
            {
              longitude: trackedPoint.coordinate[0],
              latitude: trackedPoint.coordinate[1],
            },
            camera,
            mapLayout,
          )
          const positionedIndicator = clampedEdgeIndicator(trackedPoint, positionedPoint, mapLayout)
          return [positionedIndicator ?? detectedIndicator]
        })
        applyOffscreenMapIndicatorDrafts(next)
      })
      .catch(() => {
        if (offscreenProjectionRequestRef.current !== requestId) return
        clearOffscreenMapIndicators()
      })
  }, [
    applyOffscreenMapIndicatorDrafts,
    clearOffscreenMapIndicators,
    currentCameraRef,
    directionPoint,
    historyActive,
    mapLayout,
    offscreenMapGpsCoordinate,
    selectedMapPoint,
  ])

  const handleOffscreenIndicatorPress = useCallback(
    (indicator: OffscreenMapIndicatorState) => {
      onMapInteraction()
      if (indicator.id === 'gps') {
        recenterLive({ resetPadding: true })
        return
      }
      if (indicator.type === 'direction' && !directionPoint) return
      if (indicator.type === 'mapPoint') onEnterMapMode()

      setFollowGps(false)
      const currentCamera = currentCameraRef.current
      cameraRef.current?.setCamera({
        centerCoordinate:
          indicator.type === 'direction' && directionPoint
            ? [directionPoint.longitude, directionPoint.latitude]
            : indicator.coordinate,
        zoomLevel: currentCamera?.zoomLevel,
        heading: currentCamera?.heading,
        pitch: currentCamera?.pitch,
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
    },
    [
      cameraRef,
      currentCameraRef,
      directionPoint,
      onEnterMapMode,
      onMapInteraction,
      recenterLive,
      setFollowGps,
    ],
  )

  useEffect(() => {
    updateNavigationDiagnostics({
      gpsFix,
      retainedGpsBearingDeg: retainedGpsBearing?.bearingDeg ?? null,
      retainedGpsBearingAt: retainedGpsBearing?.sourceTimestamp ?? null,
      phoneHeadingDeg,
      phoneHeadingStatus: phoneHeading.status,
      activeDisplayHeadingDeg: gpsPinBearingDeg,
      cameraHeadingDeg: cameraHeading,
      fallbackReason: getNavigationFallbackReason({
        mapNavigationMode,
        gpsFix,
        retainedGpsBearingDeg: retainedGpsBearing?.bearingDeg ?? null,
        phoneHeadingDeg,
        phoneHeadingStatus: phoneHeading.status,
      }),
    })
  }, [
    cameraHeading,
    gpsFix,
    gpsPinBearingDeg,
    mapNavigationMode,
    phoneHeading.status,
    phoneHeadingDeg,
    retainedGpsBearing?.bearingDeg,
    retainedGpsBearing?.sourceTimestamp,
    updateNavigationDiagnostics,
  ])

  useEffect(() => {
    if (previousMapStyleKeyRef.current === mapStyleKey) return
    previousMapStyleKeyRef.current = mapStyleKey
    styleReloadCameraRef.current = currentCameraRef.current
  }, [currentCameraRef, mapStyleKey])

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
    const styleReloadCamera = styleReloadCameraRef.current
    styleReloadCameraRef.current = null
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
      pitch: getPitchForZoom(camera.zoomLevel, perspectiveEnabled),
      animationDuration: 0,
    })
  }, [
    cameraRef,
    followHeadingDeg,
    getHistoryPreviewCamera,
    getLiveFollowCamera,
    historyActive,
    historyPreview,
    perspectiveEnabled,
  ])

  const handleLongPress = useCallback(
    (feature: { geometry: { coordinates: number[] } }) => {
      if (historyActive) return
      onMapInteraction()
      const [longitude, latitude] = feature.geometry.coordinates
      onLongPressTarget({ latitude, longitude })
    },
    [historyActive, onLongPressTarget, onMapInteraction],
  )

  const handleSuppressNextMapPress = useCallback(() => {
    if (suppressNextMapPressTimeoutRef.current) {
      clearTimeout(suppressNextMapPressTimeoutRef.current)
    }
    suppressNextMapPressRef.current = true
    suppressNextMapPressTimeoutRef.current = setTimeout(() => {
      suppressNextMapPressRef.current = false
      suppressNextMapPressTimeoutRef.current = null
    }, 250)
  }, [])

  const handleMapPress = useCallback(() => {
    if (suppressNextMapPressRef.current) {
      suppressNextMapPressRef.current = false
      if (suppressNextMapPressTimeoutRef.current) {
        clearTimeout(suppressNextMapPressTimeoutRef.current)
        suppressNextMapPressTimeoutRef.current = null
      }
      return
    }
    onMapPress()
  }, [onMapPress])

  useEffect(() => {
    onOffscreenMapIndicatorsChange(offscreenMapIndicators)
  }, [offscreenMapIndicators, onOffscreenMapIndicatorsChange])

  useEffect(
    () => () => {
      if (suppressNextMapPressTimeoutRef.current) {
        clearTimeout(suppressNextMapPressTimeoutRef.current)
      }
    },
    [],
  )

  const handleCameraChanged = useCallback(
    (state: {
      properties: { center: number[]; zoom: number; heading: number; pitch: number }
      gestures: { isGestureActive: boolean }
    }) => {
      const [longitude, latitude] = state.properties.center
      const camera = {
        centerCoordinate: [longitude, latitude],
        zoomLevel: state.properties.zoom,
        heading: state.properties.heading,
        pitch: state.properties.pitch,
      } satisfies CameraSnapshot
      currentCameraRef.current = camera
      const repositionedIndicators = repositionOffscreenMapIndicators(
        offscreenMapIndicatorsRef.current,
        camera,
        mapLayout,
      )
      if (repositionedIndicators !== offscreenMapIndicatorsRef.current) {
        publishOffscreenMapIndicators(repositionedIndicators)
      }
      const [targetLongitude, targetLatitude] = gpsCamera.centerCoordinate
      if (
        Math.abs(longitude - targetLongitude) < 0.0001 &&
        Math.abs(latitude - targetLatitude) < 0.0001
      ) {
        setCameraReady(true)
      }
      if (state.gestures.isGestureActive) {
        onMapInteraction()
        if (phoneHeadingMode) {
          setFollowGps(false)
        }
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
        if (!phoneHeadingMode && preservesLiveFollow) {
          setFollowZoomLevel(state.properties.zoom)
          const followCamera = getLiveFollowCameraProfile({
            gpsCamera: {
              centerCoordinate: [longitude, latitude],
              zoomLevel: state.properties.zoom,
            },
            followHeadingDeg,
            gpsHeadingMode: headingFollowMode,
            perspectiveEnabled,
          })
          if (Math.abs(state.properties.pitch - followCamera.pitch) > 0.5) {
            cameraRef.current?.setCamera({ pitch: followCamera.pitch, animationDuration: 0 })
          }
        } else {
          setFollowGps(false)
        }
      }
      setCameraHeading((current) =>
        Math.abs(current - state.properties.heading) > 0.5 ? state.properties.heading : current,
      )
      setCameraZoom((current) =>
        Math.abs(current - state.properties.zoom) > 0.25 ? state.properties.zoom : current,
      )
      onHeadingChange(state.properties.heading)
      updateOffscreenMapIndicators()
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
      mapLayout,
      onHeadingChange,
      onMapInteraction,
      perspectiveEnabled,
      phoneHeadingMode,
      publishOffscreenMapIndicators,
      setFollowGps,
      setFollowZoomLevel,
      updateOffscreenMapIndicators,
    ],
  )

  useEffect(() => {
    const frame = requestAnimationFrame(updateOffscreenMapIndicators)
    return () => cancelAnimationFrame(frame)
  }, [updateOffscreenMapIndicators])

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
      onTouchStart={onMapInteraction}
    >
      <Mapbox.MapView
        ref={mapViewRef}
        style={styles.map}
        styleURL={useCustomJSON ? undefined : selectedMapStyle.styleURL}
        styleJSON={isOneDark ? ONE_DARK_MAP_STYLE : isMapy ? BLANK_STYLE : undefined}
        pitchEnabled={false}
        rotateEnabled={!rotationLocked}
        compassEnabled={false}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        onDidFinishLoadingMap={handleMapLoaded}
        onPress={handleMapPress}
        onLongPress={handleLongPress}
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
        <CenterMapLayers
          historyActive={historyActive}
          expandSelectedMapPoints={mode === 'map'}
          isMapy={isMapy}
          isOneDark={isOneDark}
          showBuildings3d={showBuildings3d}
          weatherActive={weatherActive}
          liveTrailShape={liveTrailShape}
          rideRouteShape={rideRouteShape}
          accuracyFix={accuracyFix}
          accuracyShape={accuracyShape}
          gpsPuckBearingDeg={gpsPuckBearingDeg}
          riders={riderFocusRows}
          rideRoute={rideRoute}
          rideTelemetrySamples={rideTelemetrySamples}
          activeHistoryMapMetric={activeHistoryMapMetric}
          rideMarkers={rideMarkers}
          rideGpsSamples={rideGpsSamples}
          mediaAssets={mediaAssets}
          mapZoom={cameraZoom}
          historyMetricGradientsEnabled={historyMetricGradientsEnabled}
          historyMetricHotRanges={historyMetricHotRanges}
          directionPoint={directionPoint}
          mapPoints={mapPoints}
          selectedMapPointId={selectedMapPointId}
          hiddenMapPointKinds={hiddenMapPointKinds}
          onClearDirectionPoint={onClearDirectionPoint}
          onToggleMapPointSelection={onToggleMapPointSelection}
          onRemoveMapPoint={onRemoveMapPoint}
          onSuppressNextMapPress={handleSuppressNextMapPress}
          onSelectMarker={setSelectedHistoryMarker}
          onOpenMedia={onOpenMedia}
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
})

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

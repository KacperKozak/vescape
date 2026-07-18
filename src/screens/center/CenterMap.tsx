import Mapbox, { Camera, RasterLayer, SymbolLayer } from '@rnmapbox/maps'
import { CrosshairSimpleIcon, type Icon } from 'phosphor-react-native'
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
import { Text } from '@/components/ui/base/Text'
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
import {
  getSatelliteDarkMapStyle,
  getSatelliteImageryPaint,
} from '@/constants/satelliteDarkMapStyle'
import { getMapPointKindIcon } from '@/constants/mapPointIcons'
import { getMapPointKindColor, getMapPointKindTextColor } from '@/constants/mapPoints'
import { getOneDarkMapStyle } from '@/constants/oneDarkMapStyle'
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
import { getGpsPuckBearing } from '@/lib/map/gpsPuckHeading'
import type { LegalLimitCountry } from '@/lib/legal/legalLimits'
import type { HistoryGpsSample, HistoryMarker, TelemetrySample } from '@/store/historyStore'
import { useGroupRideStore } from '@/store/groupRideStore'
import { useNavigationDiagnosticsStore } from '@/store/navigationDiagnosticsStore'
import { useRiderStore } from '@/store/riderStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useRenderRateWarning } from '@/hooks/useRenderRateWarning'

import type { CenterViewState } from './centerViewState'
import {
  type CameraSnapshot,
  type HistoryPreviewTarget,
  useCameraControls,
} from './useCameraControls'
import { getLiveFollowCameraProfile, getPitchForZoom } from '@/lib/map/cameraProfiles'
import { shouldPreserveLiveFollowGesture } from './cameraGestureState'
import { phoneHeadingAnimationDuration, type PhoneHeadingStatus } from './phoneHeading'
import { PhoneHeadingMapLayer } from './PhoneHeadingMapLayer'
import { CenterMapLayers, rosterRiderColor } from './CenterMapLayers'
import { LegalLimitCountrySheet } from './LegalLimitCountrySheet'
import {
  DESTINATION_POINT_COLOR,
  DESTINATION_POINT_TEXT_COLOR,
  GPS_POINT_COLOR,
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
  focusWeather: () => void
  focusLegalLimits: () => void
  getViewfinderCoordinate: () => Promise<{ latitude: number; longitude: number }>
}

interface MapLayout {
  width: number
  height: number
}

// Filled dot matching the rider's map marker, so the edge indicator reads as that rider.
// Module scope keeps the reference stable for the indicator identity check.
const RiderDotIcon: Icon = ({ color }) => (
  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} />
)

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
  historySelectionKey: string | null
  historyPreviewRoute: [number, number][]
  mapStyleKey: MapStyleKey
  satelliteOverlayEnabled: boolean
  satelliteImageryOpacity: number
  satelliteImagerySaturation: number
  hideTelemetryMapDetails: boolean
  mapNavigationMode: MapNavigationMode
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onPhoneHeadingChange: (heading: number | null) => void
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
  legalLimitsActive: boolean
  historyPreview:
    | ({
        key: string
      } & HistoryPreviewTarget)
    | null
}

export const CenterMap = memo(
  forwardRef<CenterMapHandle, CenterMapProps>(function CenterMap(
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
      historySelectionKey,
      historyPreviewRoute,
      mapStyleKey,
      satelliteOverlayEnabled,
      satelliteImageryOpacity,
      satelliteImagerySaturation,
      hideTelemetryMapDetails,
      mapNavigationMode,
      rotationLocked,
      perspectiveEnabled,
      onPerspectiveChange,
      onHeadingChange,
      onPhoneHeadingChange,
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
      legalLimitsActive,
      onClearDirectionPoint,
      historyPreview,
    },
    ref,
  ) {
    const styleReloadCameraRef = useRef<CameraSnapshot | null>(null)
    const previousMapStyleKeyRef = useRef(mapStyleKey)
    const mapRevealedRef = useRef(false)
    const mapViewRef = useRef<ElementRef<typeof Mapbox.MapView> | null>(null)
    const gestureActiveRef = useRef(false)
    const offscreenProjectionRequestRef = useRef(0)
    const suppressNextMapPressRef = useRef(false)
    const suppressNextMapPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [mapOpacity] = useState(() => new Animated.Value(0))
    const [cameraReady, setCameraReady] = useState(false)
    const [selectedHistoryMarker, setSelectedHistoryMarker] =
      useState<SelectedHistoryMarker | null>(null)
    const [selectedLegalCountry, setSelectedLegalCountry] = useState<LegalLimitCountry | null>(null)
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

    useEffect(() => {
      if (legalLimitsActive) return
      const frame = requestAnimationFrame(() => setSelectedLegalCountry(null))
      return () => cancelAnimationFrame(frame)
    }, [legalLimitsActive])

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
    const requestedMapStyle = MAP_STYLES.find((style) => style.key === mapStyleKey) ?? MAP_STYLES[0]
    const selectedMapStyle =
      requestedMapStyle.key === 'mapy' && !IS_MAPY_CONFIGURED ? MAP_STYLES[0] : requestedMapStyle
    const isMapy = selectedMapStyle.key === 'mapy'
    const isOneDark = selectedMapStyle.key === 'onedark'
    const isSatellite = selectedMapStyle.key === 'satellite'
    const mapDetailsVisible = mode === 'map' || (mode === 'telemetry' && !hideTelemetryMapDetails)
    const isSatelliteOverlay = isSatellite && satelliteOverlayEnabled
    const effectiveSatelliteImageryOpacity = mode === 'telemetry' ? satelliteImageryOpacity : 1
    const effectiveSatelliteImagerySaturation =
      mode === 'telemetry' ? satelliteImagerySaturation : 0
    const useCustomJSON = isMapy || isOneDark || isSatelliteOverlay
    const satelliteStyleJSON = useMemo(
      () =>
        getSatelliteDarkMapStyle(
          satelliteImageryOpacity,
          true,
          true,
          false,
          true,
          satelliteImagerySaturation,
        ),
      [satelliteImageryOpacity, satelliteImagerySaturation],
    )
    const satelliteImageryPaint = useMemo(
      () =>
        getSatelliteImageryPaint(
          effectiveSatelliteImageryOpacity,
          effectiveSatelliteImagerySaturation,
        ),
      [effectiveSatelliteImageryOpacity, effectiveSatelliteImagerySaturation],
    )
    const oneDarkStyleJSON = useMemo(() => getOneDarkMapStyle(true, true, false), [])
    const showBuildings3d =
      selectedMapStyle.key === 'outdoors' || selectedMapStyle.key === 'onedark'

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
    const phoneHeadingDegRef = useRef<number | null>(null)
    const [phoneHeadingStatus, setPhoneHeadingStatus] = useState<PhoneHeadingStatus | 'idle'>(
      'idle',
    )
    const handlePhoneHeadingChange = useCallback(
      (headingDeg: number | null) => {
        phoneHeadingDegRef.current = headingDeg
        onPhoneHeadingChange(headingDeg)
      },
      [onPhoneHeadingChange],
    )
    const headingFollowMode = gpsHeadingMode || phoneHeadingMode
    useRenderRateWarning('CenterMap')
    const targetFollowHeadingDeg = gpsHeadingMode
      ? (directionBearingDeg ?? 0)
      : phoneHeadingMode
        ? cameraHeading
        : 0
    const followHeadingDeg = targetFollowHeadingDeg
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
      historyActive,
      historySelectionKey,
      historyPreview,
      historyPreviewRoute,
      rideRoute,
      mapViewport: mapLayout,
      mapNavigationMode,
      gpsHeadingMode: headingFollowMode,
      phoneHeadingMode,
      phoneHeadingReady: phoneHeadingStatus === 'ready',
      getFollowHeadingDeg,
      resetHeadingOnRecenter: mapNavigationMode !== 'freeRotate',
      liveFollowUpdatesEnabled: !(phoneHeadingMode && mode === 'map'),
      followAnimationDuration: headingFollowMode
        ? phoneHeadingAnimationDuration()
        : MAP_DEFAULTS.followAnimationDuration,
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
    // Peers' shared targets, pre-shaped as offscreen-indicator tracked points. Index-aligned
    // with the `riders` prop of CenterMapLayers so pin and edge indicator share one tint.
    const riderTargetPoints = useMemo(
      () =>
        mapRiders.flatMap((rider, index) => {
          const target = rider.presence?.target
          if (!target) return []
          const color = rosterRiderColor(rider, index)
          return [
            {
              id: `rider-target-${rider.id}`,
              type: 'riderTarget' as const,
              coordinate: [target.lng, target.lat] as [number, number],
              color,
              textColor: color,
              icon: getMapPointKindIcon('direction'),
            },
          ]
        }),
      [mapRiders],
    )
    // Peers themselves, same shape and index-aligned tint as their map pins.
    const riderPoints = useMemo(
      () =>
        mapRiders.flatMap((rider, index) => {
          const presence = rider.presence
          if (!presence) return []
          const color = rosterRiderColor(rider, index)
          return [
            {
              id: `rider-${rider.id}`,
              type: 'rider' as const,
              coordinate: [presence.lng, presence.lat] as [number, number],
              color,
              textColor: color,
              icon: RiderDotIcon,
            },
          ]
        }),
      [mapRiders],
    )

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
      const current = currentCameraRef.current
      cameraRef.current?.setCamera({
        centerCoordinate: [rider.presence.lng, rider.presence.lat],
        zoomLevel: Math.max(current?.zoomLevel ?? MAP_DEFAULTS.persistedGpsFallbackZoom, 15),
        heading: current?.heading,
        pitch: current?.pitch,
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
    }, [
      cameraRef,
      currentCameraRef,
      historyActive,
      riderFocusRequest,
      riderFocusRows,
      setFollowGps,
    ])

    const updateOffscreenMapIndicators = useCallback(() => {
      const camera = currentCameraRef.current
      const mapView = mapViewRef.current
      if (
        mapView == null ||
        historyActive ||
        (offscreenMapGpsCoordinate == null &&
          directionPoint == null &&
          selectedMapPoint == null &&
          riderTargetPoints.length === 0 &&
          riderPoints.length === 0) ||
        mapLayout.width <= 0 ||
        mapLayout.height <= 0
      ) {
        offscreenProjectionRequestRef.current += 1
        clearOffscreenMapIndicators()
        return
      }

      const requestId = offscreenProjectionRequestRef.current + 1
      offscreenProjectionRequestRef.current = requestId
      const ownRiderMapColor = riderColor ?? GPS_POINT_COLOR
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
                color: ownRiderMapColor,
                textColor: ownRiderMapColor,
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
                color: riderColor ?? DESTINATION_POINT_COLOR,
                textColor: riderColor ?? DESTINATION_POINT_TEXT_COLOR,
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
        ...riderTargetPoints,
        ...riderPoints,
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
            const positionedIndicator = clampedEdgeIndicator(
              trackedPoint,
              positionedPoint,
              mapLayout,
            )
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
      riderColor,
      riderPoints,
      riderTargetPoints,
      selectedMapPoint,
    ])

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
        const currentCamera = currentCameraRef.current
        cameraRef.current?.setCamera({
          centerCoordinate:
            indicator.type === 'direction' && directionPoint
              ? [directionPoint.longitude, directionPoint.latitude]
              : indicator.coordinate.value,
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
        focusRider,
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

    const handleTouchStart = useCallback(() => {
      onMapInteraction()
      stopCameraAnimation()
    }, [onMapInteraction, stopCameraAnimation])

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
      if (mode === 'telemetry') {
        onOffscreenMapIndicatorsChange(offscreenMapIndicators)
      }
    }, [mode, offscreenMapIndicators, onOffscreenMapIndicatorsChange])

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
        if (historyActive && mediaAssets.length > 0) {
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
        mapLayout,
        mode,
        onHeadingChange,
        mediaAssets.length,
        perspectiveEnabled,
        phoneHeadingMode,
        publishOffscreenMapIndicators,
        setFollowGps,
        setFollowZoomLevel,
        updateOffscreenMapIndicators,
      ],
    )

    const handleMapIdle = useCallback(() => {
      const heading = currentCameraRef.current?.heading
      if (heading != null) setCameraHeading(heading)
    }, [currentCameraRef])

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
        onTouchStart={handleTouchStart}
      >
        <Mapbox.MapView
          ref={mapViewRef}
          style={styles.map}
          styleURL={useCustomJSON ? undefined : selectedMapStyle.styleURL}
          styleJSON={
            isOneDark
              ? oneDarkStyleJSON
              : isMapy
                ? BLANK_STYLE
                : isSatelliteOverlay
                  ? satelliteStyleJSON
                  : undefined
          }
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
          {isSatelliteOverlay ? (
            <>
              <RasterLayer
                id="satellite"
                existing
                style={{
                  ...satelliteImageryPaint,
                  rasterOpacityTransition: { duration: 260, delay: 0 },
                  rasterSaturationTransition: { duration: 260, delay: 0 },
                  rasterContrastTransition: { duration: 260, delay: 0 },
                }}
              />
              {[
                'road-path',
                'road-track',
                'road-service',
                'road-street',
                'road-secondary-tertiary',
                'road-primary',
                'road-trunk',
                'road-motorway',
              ].map((id) => (
                <Mapbox.LineLayer
                  key={id}
                  id={id}
                  existing
                  style={{
                    lineOpacity: mode === 'telemetry' ? 0.35 : 0.75,
                    lineOpacityTransition: { duration: 260, delay: 0 },
                  }}
                />
              ))}
            </>
          ) : null}
          {isOneDark ? (
            <>
              <SymbolLayer
                id="poi-label"
                existing
                style={{ visibility: mapDetailsVisible ? 'visible' : 'none' }}
              />
              <SymbolLayer
                id="poi-icon"
                existing
                style={{
                  visibility: mapDetailsVisible ? 'visible' : 'none',
                  iconColor: '#74859a',
                  iconHaloWidth: 0.5,
                  iconOpacity: 0.48,
                }}
              />
              <SymbolLayer
                id="transit-stop-icon"
                existing
                style={{
                  visibility: mapDetailsVisible ? 'visible' : 'none',
                  iconColor: '#74859a',
                  iconHaloWidth: 0.5,
                  iconOpacity: 0.48,
                }}
              />
            </>
          ) : null}
          {isSatelliteOverlay ? (
            <>
              <SymbolLayer
                id="poi-label"
                existing
                style={{ visibility: mapDetailsVisible ? 'visible' : 'none' }}
              />
              <SymbolLayer
                id="transit-label"
                existing
                style={{ visibility: mapDetailsVisible ? 'visible' : 'none' }}
              />
            </>
          ) : null}
          {(selectedMapStyle.key === 'outdoors' || (isSatellite && !isSatelliteOverlay)) && (
            <>
              <SymbolLayer
                id="poi-label"
                existing
                style={{
                  visibility: mapDetailsVisible ? 'visible' : 'none',
                }}
              />
              <SymbolLayer
                id="transit-label"
                existing
                style={{
                  visibility: mapDetailsVisible ? 'visible' : 'none',
                }}
              />
            </>
          )}
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
          <CenterMapLayers
            historyActive={historyActive}
            expandSelectedMapPoints={mode === 'map'}
            isMapy={isMapy}
            isOneDark={isOneDark}
            isSatellite={isSatelliteOverlay}
            showBuildings3d={showBuildings3d}
            weatherActive={weatherActive}
            legalLimitsActive={legalLimitsActive}
            liveTrailShape={liveTrailShape}
            rideRouteShape={rideRouteShape}
            accuracyFix={accuracyFix}
            accuracyShape={accuracyShape}
            gpsPuckBearingDeg={gpsPuckBearingDeg}
            riders={mapRiders}
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
            onSelectLegalCountry={(country) => {
              if (legalLimitsActive) setSelectedLegalCountry(country)
            }}
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

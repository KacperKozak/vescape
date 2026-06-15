import Mapbox, {
  Camera,
  FillExtrusionLayer,
  FillLayer,
  LineLayer,
  RasterLayer,
  RasterSource,
  ShapeSource,
} from '@rnmapbox/maps'
import type { LineLayerStyle } from '@rnmapbox/maps'
import {
  ArrowUpIcon,
  ClockCountdownIcon,
  CrosshairSimpleIcon,
  LinkBreakIcon,
  MapPinIcon,
  PlugsConnectedIcon,
  StopIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from 'react'
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import type { LocationEvent, MapPoint, MapPointKind } from 'vesc-ble'

import { InfoModal } from '@/components/ui/modals/InfoModal'
import { MapPin } from '@/components/domain/map/MapPin'
import { RainViewerOverlay } from '@/components/domain/map/RainViewerOverlay'
import { MediaHistoryPin } from '@/components/domain/history/MediaHistoryPin'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import {
  BLANK_STYLE,
  MAP_DEFAULTS,
  MAP_STYLES,
  type MapNavigationMode,
  type MapStyleKey,
} from '@/constants/mapStyles'
import { getMapPointKindIcon } from '@/constants/mapPointIcons'
import {
  getMapPointKindColor,
  getMapPointKindLabel,
  getMapPointKindTextColor,
} from '@/constants/mapPoints'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'
import {
  getLiveGpsPresentation,
  getReliableGpsBearingFromFixes,
} from '@/helpers/liveGpsPresentation'
import {
  distanceMeters,
  isPointOutsideVisibleMapArea,
  makeCircleFeature,
  makeTrailLineString,
} from '@/helpers/mapGeometry'
import { resolveMarkerRenderData } from '@/lib/history/markerOverlap'
import {
  clusterMediaHistoryAssets,
  MEDIA_CLUSTER_DISTANCE_M,
  type MediaHistoryAsset,
} from '@/lib/history/mediaHistory'
import { isMapPointKindVisible } from '@/lib/mapPointVisibility'
import {
  getHistoryMetricColorRange,
  getMetricRampColor,
  getTelemetrySampleMetricValue,
  type HistoryMetricHotRanges,
  type HistoryMetricKey,
} from '@/lib/history/metricColorScale'
import { getNavigationFallbackReason } from '@/lib/map/navigationDiagnostics'
import type { HistoryGpsSample, HistoryMarker, TelemetrySample } from '@/store/historyStore'
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
import { MapVignette } from './MapVignette'
import { phoneHeadingAnimationDuration } from './phoneHeading'
import { usePhoneHeading } from './usePhoneHeading'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

export interface CenterMapHandle {
  recenterLive: (options?: { resetPadding?: boolean; animationDuration?: number }) => void
  previewHistorySession: (preview: HistoryPreviewTarget) => void
  beginPreviewPan: () => void
  previewPanBy: (deltaX: number, deltaY: number, animationDuration?: number) => void
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

interface SelectedHistoryMarker {
  marker: HistoryMarker
  gps: HistoryGpsSample
}

const HEADING_SMOOTHING_TAU_MS = 180
const HEADING_SNAP_DEG = 0.08
const OFFSCREEN_GPS_INDICATOR_SIZE = 64
const OFFSCREEN_GPS_EDGE_SIDE_INSET = 58
const OFFSCREEN_GPS_EDGE_TOP_INSET = 122
const OFFSCREEN_GPS_EDGE_BOTTOM_INSET = 142
const GPS_POINT_COLOR = theme.target.color
const GPS_POINT_TEXT_COLOR = theme.target.text
const DESTINATION_POINT_COLOR = theme.gps.color
const DESTINATION_POINT_TEXT_COLOR = theme.gps.text
const HISTORY_ROUTE_HIGHLIGHT_INTERVAL_MS = 50
const HISTORY_ROUTE_HIGHLIGHT_DELAY_MS = 500
const HISTORY_ROUTE_HIGHLIGHT_WIDTH = 0.24
const HISTORY_ROUTE_HIGHLIGHT_COLOR = theme.neutral.routeHighlight
const HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT = theme.neutral.routeHighlightTransparent
const HISTORY_ROUTE_HIGHLIGHT_MIN_DURATION_MS = 1400
const HISTORY_ROUTE_HIGHLIGHT_MAX_DURATION_MS = 5200
const HISTORY_ROUTE_HIGHLIGHT_MS_PER_KM = 260
interface MapLayout {
  width: number
  height: number
}

export interface OffscreenMapIndicatorState {
  id: string
  type: 'gps' | 'direction' | 'mapPoint'
  coordinate: [number, number]
  color: string
  textColor: string
  icon: Icon
  x: number
  y: number
  angleDeg: number
}

const HISTORY_MARKER_LABELS: Record<HistoryMarker['type'], string> = {
  app_stop: 'Recording stopped',
  connected: 'Board connected',
  connection_lost: 'Board connection lost',
  disconnected: 'Board disconnected',
  error: 'Error',
  gap: 'History gap',
}

const HISTORY_MARKER_ICONS: Record<HistoryMarker['type'], Icon> = {
  app_stop: StopIcon,
  connected: PlugsConnectedIcon,
  connection_lost: LinkBreakIcon,
  disconnected: LinkBreakIcon,
  error: WarningCircleIcon,
  gap: ClockCountdownIcon,
}

const HISTORY_MARKER_COLORS: Record<HistoryMarker['type'], string> = {
  app_stop: theme.highlight.color,
  connected: theme.gps.color,
  connection_lost: theme.warning.color,
  disconnected: theme.warning.color,
  error: theme.error.color,
  gap: theme.highlight.color,
}

function formatMarkerTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms} ms`
  const seconds = Math.round(ms / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
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

function nearlySameIndicator(
  current: OffscreenMapIndicatorState[],
  next: OffscreenMapIndicatorState[],
) {
  if (current.length !== next.length) return false
  return next.every((nextIndicator, index) => {
    const currentIndicator = current[index]
    return (
      currentIndicator?.id === nextIndicator.id &&
      Math.abs(currentIndicator.x - nextIndicator.x) < 0.5 &&
      Math.abs(currentIndicator.y - nextIndicator.y) < 0.5 &&
      Math.abs(currentIndicator.angleDeg - nextIndicator.angleDeg) < 0.5
    )
  })
}

function clampedEdgeIndicator(
  trackedPoint: Pick<
    OffscreenMapIndicatorState,
    'id' | 'type' | 'coordinate' | 'color' | 'textColor' | 'icon'
  >,
  point: { x: number; y: number },
  layout: MapLayout,
): OffscreenMapIndicatorState | null {
  if (
    !isPointOutsideVisibleMapArea(point, layout, {
      top: OFFSCREEN_GPS_EDGE_TOP_INSET,
      bottom: OFFSCREEN_GPS_EDGE_BOTTOM_INSET,
    })
  ) {
    return null
  }

  const left = Math.min(OFFSCREEN_GPS_EDGE_SIDE_INSET, layout.width / 2)
  const right = Math.max(left, layout.width - OFFSCREEN_GPS_EDGE_SIDE_INSET)
  const top = Math.min(OFFSCREEN_GPS_EDGE_TOP_INSET, layout.height / 2)
  const bottom = Math.max(top, layout.height - OFFSCREEN_GPS_EDGE_BOTTOM_INSET)
  const centerX = layout.width / 2
  const centerY = layout.height / 2
  const deltaX = point.x - centerX
  const deltaY = point.y - centerY

  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) {
    return null
  }

  const candidates = [
    deltaX < 0 ? (left - centerX) / deltaX : Number.POSITIVE_INFINITY,
    deltaX > 0 ? (right - centerX) / deltaX : Number.POSITIVE_INFINITY,
    deltaY < 0 ? (top - centerY) / deltaY : Number.POSITIVE_INFINITY,
    deltaY > 0 ? (bottom - centerY) / deltaY : Number.POSITIVE_INFINITY,
  ].filter((value) => value > 0)
  const scale = Math.min(...candidates)

  if (!Number.isFinite(scale)) return null

  return {
    ...trackedPoint,
    x: Math.min(right, Math.max(left, centerX + deltaX * scale)),
    y: Math.min(bottom, Math.max(top, centerY + deltaY * scale)),
    angleDeg: (Math.atan2(deltaX, -deltaY) * 180) / Math.PI,
  }
}

function bearingDeg(
  from: { longitude: number; latitude: number },
  to: { longitude: number; latitude: number },
) {
  const fromLat = (from.latitude * Math.PI) / 180
  const toLat = (to.latitude * Math.PI) / 180
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180
  const y = Math.sin(deltaLon) * Math.cos(toLat)
  const x =
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon)
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI)
}

function projectCoordinateToEdgePoint(
  coordinate: { longitude: number; latitude: number },
  camera: CameraSnapshot,
  layout: MapLayout,
) {
  const center = {
    longitude: camera.centerCoordinate[0],
    latitude: camera.centerCoordinate[1],
  }
  const angleRad = ((bearingDeg(center, coordinate) - camera.heading) * Math.PI) / 180
  const radius = Math.max(layout.width, layout.height)
  return {
    x: layout.width / 2 + Math.sin(angleRad) * radius,
    y: layout.height / 2 - Math.cos(angleRad) * radius,
  }
}

function repositionOffscreenMapIndicators(
  current: OffscreenMapIndicatorState[],
  camera: CameraSnapshot,
  layout: MapLayout,
): OffscreenMapIndicatorState[] {
  const next = current.flatMap((indicator) => {
    const point = projectCoordinateToEdgePoint(
      { longitude: indicator.coordinate[0], latitude: indicator.coordinate[1] },
      camera,
      layout,
    )
    const positioned = clampedEdgeIndicator(indicator, point, layout)
    return positioned ? [positioned] : []
  })
  return nearlySameIndicator(current, next) ? current : next
}

function usableCoordinate(location: { longitude: number; latitude: number } | null | undefined) {
  if (!location) return null
  if (!Number.isFinite(location.longitude) || !Number.isFinite(location.latitude)) return null
  return {
    longitude: location.longitude,
    latitude: location.latitude,
  }
}

function buildHistoryMarkerMessage(selection: SelectedHistoryMarker): string {
  const { marker, gps } = selection
  const lines = [
    `Type: ${marker.type}`,
    `Meaning: ${HISTORY_MARKER_LABELS[marker.type]}`,
    `Marker time: ${formatMarkerTime(marker.occurredAtMs)}`,
    `Nearest GPS time: ${formatMarkerTime(gps.capturedAtMs)}`,
    `Time offset: ${formatDuration(Math.abs(gps.capturedAtMs - marker.occurredAtMs))}`,
    `Coordinate: ${gps.latitude.toFixed(7)}, ${gps.longitude.toFixed(7)}`,
  ]

  if (gps.accuracyM != null) lines.push(`GPS accuracy: ${gps.accuracyM.toFixed(1)} m`)
  if (marker.deviceName) lines.push(`Board: ${marker.deviceName}`)
  if (marker.gapMs != null) lines.push(`Gap duration: ${formatDuration(marker.gapMs)}`)
  if (marker.message) lines.push(`Message: ${marker.message}`)

  return lines.join('\n')
}

export function OffscreenMapIndicator({
  indicator,
  onPress,
}: {
  indicator: OffscreenMapIndicatorState
  onPress: () => void
}) {
  const IconComponent = indicator.icon
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        indicator.type === 'gps'
          ? 'Recenter map on current position'
          : indicator.type === 'direction'
            ? 'Show direction point'
            : 'Show selected map point'
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.offscreenMapIndicator,
        {
          left: indicator.x - OFFSCREEN_GPS_INDICATOR_SIZE / 2,
          top: indicator.y - OFFSCREEN_GPS_INDICATOR_SIZE / 2,
        },
        pressed && styles.offscreenMapIndicatorPressed,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.offscreenMapArrowOrbit,
          { transform: [{ rotate: `${indicator.angleDeg}deg` }] },
        ]}
      >
        <ArrowUpIcon size={22} color={indicator.textColor} weight="bold" />
      </View>
      <View
        pointerEvents="none"
        style={[styles.offscreenMapIcon, { borderColor: indicator.color }]}
      >
        <IconComponent size={24} color={indicator.textColor} weight="bold" />
      </View>
    </Pressable>
  )
}

interface CenterMapLayersProps {
  historyActive: boolean
  expandSelectedMapPoints: boolean
  isMapy: boolean
  isOneDark: boolean
  showBuildings3d: boolean
  weatherActive: boolean
  liveTrailShape: ReturnType<typeof makeTrailLineString> | null
  rideRouteShape: {
    type: 'Feature'
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    properties: Record<string, never>
  } | null
  accuracyFix: { longitude: number; latitude: number } | null
  accuracyShape: ReturnType<typeof makeCircleFeature> | null
  gpsBearingDeg: number | null
  rideRoute: [number, number][]
  seekPosition: HistoryGpsSample | null
  rideTelemetrySamples: TelemetrySample[]
  activeHistoryMapMetric: HistoryMetricKey
  rideMarkers: HistoryMarker[]
  rideGpsSamples: HistoryGpsSample[]
  mediaAssets: MediaHistoryAsset[]
  mapZoom: number
  directionPoint: MapPoint | null
  mapPoints: MapPoint[]
  selectedMapPointId: string | null
  hiddenMapPointKinds: MapPointKind[]
  onClearDirectionPoint: () => void
  onToggleMapPointSelection: (id: string) => void
  onRemoveMapPoint: (id: string) => void
  onSuppressNextMapPress: () => void
  onSelectMarker: (selection: SelectedHistoryMarker) => void
  onOpenMedia: (asset: MediaHistoryAsset) => void
}

function LiveMapLayers({
  liveTrailShape,
  accuracyFix,
  accuracyShape,
  gpsBearingDeg,
}: {
  liveTrailShape: CenterMapLayersProps['liveTrailShape']
  accuracyFix: CenterMapLayersProps['accuracyFix']
  accuracyShape: CenterMapLayersProps['accuracyShape']
  gpsBearingDeg: CenterMapLayersProps['gpsBearingDeg']
}) {
  return (
    <>
      {liveTrailShape && (
        <ShapeSource id="center-live-trail-source" shape={liveTrailShape} lineMetrics>
          <LineLayer
            id="center-live-trail-line"
            style={{
              lineColor: MAP_DEFAULTS.trailColor,
              lineWidth: MAP_DEFAULTS.trailWidth,
              lineCap: 'round',
              lineJoin: 'round',
              lineGradient: [
                'interpolate',
                ['linear'],
                ['line-progress'],
                0,
                MAP_DEFAULTS.trailGradientStart,
                1,
                MAP_DEFAULTS.trailGradientEnd,
              ],
            }}
          />
        </ShapeSource>
      )}
      {accuracyFix && (
        <>
          {accuracyShape && (
            <ShapeSource id="center-gps-accuracy-source" shape={accuracyShape}>
              <FillLayer
                id="center-gps-accuracy-fill"
                style={{ fillColor: MAP_DEFAULTS.accuracyFillColor }}
              />
            </ShapeSource>
          )}
          <MapPin
            id="center-gps-position"
            coordinate={[accuracyFix.longitude, accuracyFix.latitude]}
            color={GPS_POINT_COLOR}
            bearingDeg={gpsBearingDeg}
          />
        </>
      )}
    </>
  )
}

function HistoryMapLayers({
  rideRouteShape,
  rideRoute,
  seekPosition,
  rideTelemetrySamples,
  activeHistoryMapMetric,
  rideMarkers,
  rideGpsSamples,
  mediaAssets,
  mapZoom,
  onSuppressNextMapPress,
  onSelectMarker,
  onOpenMedia,
}: {
  rideRouteShape: CenterMapLayersProps['rideRouteShape']
  rideRoute: CenterMapLayersProps['rideRoute']
  seekPosition: CenterMapLayersProps['seekPosition']
  rideTelemetrySamples: CenterMapLayersProps['rideTelemetrySamples']
  activeHistoryMapMetric: CenterMapLayersProps['activeHistoryMapMetric']
  rideMarkers: CenterMapLayersProps['rideMarkers']
  rideGpsSamples: CenterMapLayersProps['rideGpsSamples']
  mediaAssets: CenterMapLayersProps['mediaAssets']
  mapZoom: CenterMapLayersProps['mapZoom']
  onSuppressNextMapPress: CenterMapLayersProps['onSuppressNextMapPress']
  onSelectMarker: CenterMapLayersProps['onSelectMarker']
  onOpenMedia: CenterMapLayersProps['onOpenMedia']
}) {
  const [highlightProgress, setHighlightProgress] = useState(0)
  const highlightDurationMs = useMemo(
    () => getHistoryRouteHighlightDurationMs(rideRoute),
    [rideRoute],
  )

  useEffect(() => {
    if (!rideRouteShape) return
    const resetFrame = requestAnimationFrame(() => setHighlightProgress(0))
    let interval: ReturnType<typeof setInterval> | null = null
    const timeout = setTimeout(() => {
      const startedAt = Date.now()
      interval = setInterval(() => {
        const progress = (Date.now() - startedAt) / highlightDurationMs
        setHighlightProgress(Math.min(1, progress))
        if (progress >= 1 && interval) clearInterval(interval)
      }, HISTORY_ROUTE_HIGHLIGHT_INTERVAL_MS)
    }, HISTORY_ROUTE_HIGHLIGHT_DELAY_MS)
    return () => {
      cancelAnimationFrame(resetFrame)
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [highlightDurationMs, rideRouteShape])

  const routeHighlightGradient = useMemo(
    () => getHistoryRouteHighlightGradient(highlightProgress),
    [highlightProgress],
  )
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const routeMetricGradient = useMemo(
    () =>
      getHistoryRouteMetricGradient({
        gpsSamples: rideGpsSamples,
        telemetrySamples: rideTelemetrySamples,
        metric: activeHistoryMapMetric,
        hotRanges,
        gradientsEnabled,
      }),
    [activeHistoryMapMetric, gradientsEnabled, hotRanges, rideGpsSamples, rideTelemetrySamples],
  )
  const mediaClusters = useMemo(
    () =>
      clusterMediaHistoryAssets(
        mediaAssets,
        MEDIA_CLUSTER_DISTANCE_M * 2 ** Math.max(0, Math.min(8, 16 - mapZoom)),
      ),
    [mapZoom, mediaAssets],
  )

  return (
    <>
      {rideRouteShape && (
        <ShapeSource id="center-ride-route-source" shape={rideRouteShape} lineMetrics>
          <LineLayer
            id="center-ride-route-line"
            style={{
              lineColor: getHistoryMetricBaseColor(activeHistoryMapMetric),
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
              ...(routeMetricGradient ? { lineGradient: routeMetricGradient } : {}),
            }}
          />
          <LineLayer
            id="center-ride-route-highlight"
            style={{
              lineGradient: routeHighlightGradient,
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>
      )}
      {rideRoute[0] && (
        <MapPin id="center-ride-start" coordinate={rideRoute[0]} color={theme.gps.color} />
      )}
      {rideRoute.at(-1) && (
        <MapPin id="center-ride-end" coordinate={rideRoute.at(-1)!} color={theme.error.color} />
      )}
      {seekPosition && seekPosition.latitude != null && seekPosition.longitude != null && (
        <MapPin
          id="center-seek-position"
          coordinate={[seekPosition.longitude, seekPosition.latitude]}
          color={MAP_DEFAULTS.markerColor}
        />
      )}
      {resolveMarkerRenderData(rideMarkers, rideGpsSamples).map(
        ({ marker, gps, renderCoordinate }) => (
          <MapPin
            key={marker.id}
            id={`center-ride-marker-${marker.id}`}
            coordinate={renderCoordinate}
            color={HISTORY_MARKER_COLORS[marker.type]}
            icon={HISTORY_MARKER_ICONS[marker.type]}
            onSelected={() => {
              onSuppressNextMapPress()
              onSelectMarker({ marker, gps })
            }}
          />
        ),
      )}
      {mediaClusters.map((cluster) => (
        <MediaHistoryPin
          key={cluster.id}
          cluster={cluster}
          onPress={() => {
            onSuppressNextMapPress()
            onOpenMedia(cluster.assets[0])
          }}
        />
      ))}
    </>
  )
}

function getHistoryRouteHighlightGradient(
  progress: number,
): NonNullable<LineLayerStyle['lineGradient']> {
  const peak = -HISTORY_ROUTE_HIGHLIGHT_WIDTH + progress * (1 + HISTORY_ROUTE_HIGHLIGHT_WIDTH * 2)
  const leadingEdge = Math.max(0, peak - HISTORY_ROUTE_HIGHLIGHT_WIDTH)
  const trailingEdge = Math.min(1, peak + HISTORY_ROUTE_HIGHLIGHT_WIDTH)

  if (peak <= 0) {
    if (trailingEdge <= 0) {
      return [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
        1,
        HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
    }
    return [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      HISTORY_ROUTE_HIGHLIGHT_COLOR,
      trailingEdge,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      1,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
    ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
  }

  if (peak >= 1) {
    if (leadingEdge >= 1) {
      return [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
        1,
        HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
    }
    return [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      leadingEdge,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      1,
      HISTORY_ROUTE_HIGHLIGHT_COLOR,
    ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
  }

  if (leadingEdge <= 0) {
    return [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      peak,
      HISTORY_ROUTE_HIGHLIGHT_COLOR,
      trailingEdge,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      1,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
    ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
  }

  if (trailingEdge >= 1) {
    return [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      leadingEdge,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
      peak,
      HISTORY_ROUTE_HIGHLIGHT_COLOR,
      1,
      HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
    ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
  }

  return [
    'interpolate',
    ['linear'],
    ['line-progress'],
    0,
    HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
    leadingEdge,
    HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
    peak,
    HISTORY_ROUTE_HIGHLIGHT_COLOR,
    trailingEdge,
    HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
    1,
    HISTORY_ROUTE_HIGHLIGHT_TRANSPARENT,
  ] as unknown as NonNullable<LineLayerStyle['lineGradient']>
}

function getHistoryMetricBaseColor(metric: HistoryMetricKey): string {
  switch (metric) {
    case 'speed':
      return telemetry.speed.color
    case 'duty':
      return telemetry.duty.color
    case 'battery':
      return telemetry.battVoltage.color
    case 'tempMotor':
      return telemetry.motorTemp.color
    case 'tempController':
      return telemetry.controllerTemp.color
    case 'motorCurrent':
      return telemetry.motorCurrent.color
    case 'batteryCurrent':
      return telemetry.battCurrent.color
  }
}

function getNearestTelemetrySample(
  samples: readonly TelemetrySample[],
  targetMs: number,
): TelemetrySample | null {
  if (samples.length === 0) return null
  let lo = 0
  let hi = samples.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const at = samples[mid].capturedAtMs
    if (at === targetMs) return samples[mid]
    if (at < targetMs) lo = mid + 1
    else hi = mid - 1
  }
  if (hi < 0) return samples[0]
  if (lo >= samples.length) return samples[samples.length - 1]
  const before = samples[hi]
  const after = samples[lo]
  return targetMs - before.capturedAtMs <= after.capturedAtMs - targetMs ? before : after
}

function advanceNearestTelemetryIndex(
  samples: readonly TelemetrySample[],
  currentIndex: number,
  targetMs: number,
): number {
  let index = Math.max(0, Math.min(currentIndex, samples.length - 1))
  while (
    index + 1 < samples.length &&
    Math.abs(samples[index + 1].capturedAtMs - targetMs) <=
      Math.abs(samples[index].capturedAtMs - targetMs)
  ) {
    index += 1
  }
  return index
}

function getRouteDistanceProgress(samples: readonly HistoryGpsSample[]): number[] {
  const distances = new Array<number>(samples.length).fill(0)
  let distanceM = 0
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1]
    const to = samples[index]
    distanceM += distanceMeters(
      { longitude: from.longitude, latitude: from.latitude },
      { longitude: to.longitude, latitude: to.latitude },
    )
    distances[index] = distanceM
  }

  if (distanceM <= 0) return distances
  return distances.map((distance) => Math.max(0, Math.min(1, distance / distanceM)))
}

function getHistoryRouteMetricGradient({
  gpsSamples,
  telemetrySamples,
  metric,
  hotRanges,
  gradientsEnabled,
}: {
  gpsSamples: readonly HistoryGpsSample[]
  telemetrySamples: readonly TelemetrySample[]
  metric: HistoryMetricKey
  hotRanges: HistoryMetricHotRanges
  gradientsEnabled: boolean
}): NonNullable<LineLayerStyle['lineGradient']> | null {
  if (gpsSamples.length < 2 || telemetrySamples.length === 0) return null
  const baseColor = getHistoryMetricBaseColor(metric)
  const range = getHistoryMetricColorRange(metric, baseColor, hotRanges, gradientsEnabled)
  if (!range) return null

  const lastIndex = gpsSamples.length - 1
  const routeProgress = getRouteDistanceProgress(gpsSamples)
  const maxStops = 160
  const step = Math.max(1, Math.floor(lastIndex / (maxStops - 1)))
  const expression: unknown[] = ['interpolate', ['linear'], ['line-progress']]

  let lastProgress = -1
  let telemetryIndex = 0
  for (let index = 0; index < gpsSamples.length; index += step) {
    const gpsSample = gpsSamples[index]
    telemetryIndex = advanceNearestTelemetryIndex(
      telemetrySamples,
      telemetryIndex,
      gpsSample.capturedAtMs,
    )
    const telemetrySample = telemetrySamples[telemetryIndex]
    const value = telemetrySample ? getTelemetrySampleMetricValue(telemetrySample, metric) : null
    const previousStop = expression.at(-2)
    const previousProgress = typeof previousStop === 'number' ? previousStop : -1
    lastProgress = routeProgress[index] ?? 0
    if (lastProgress <= previousProgress) continue
    expression.push(lastProgress, value == null ? baseColor : getMetricRampColor(value, range))
  }

  if (lastProgress < 1) {
    const lastGpsSample = gpsSamples[lastIndex]
    const lastTelemetrySample = getNearestTelemetrySample(
      telemetrySamples,
      lastGpsSample.capturedAtMs,
    )
    const lastValue = lastTelemetrySample
      ? getTelemetrySampleMetricValue(lastTelemetrySample, metric)
      : null
    expression.push(1, lastValue == null ? baseColor : getMetricRampColor(lastValue, range))
  }

  return expression as unknown as NonNullable<LineLayerStyle['lineGradient']>
}

function getHistoryRouteHighlightDurationMs(route: [number, number][]) {
  if (route.length < 2) return HISTORY_ROUTE_HIGHLIGHT_MIN_DURATION_MS
  let distanceM = 0
  for (let index = 1; index < route.length; index += 1) {
    const [fromLongitude, fromLatitude] = route[index - 1]
    const [toLongitude, toLatitude] = route[index]
    distanceM += distanceMeters(
      { longitude: fromLongitude, latitude: fromLatitude },
      { longitude: toLongitude, latitude: toLatitude },
    )
  }
  return Math.min(
    HISTORY_ROUTE_HIGHLIGHT_MAX_DURATION_MS,
    Math.max(
      HISTORY_ROUTE_HIGHLIGHT_MIN_DURATION_MS,
      (distanceM / 1000) * HISTORY_ROUTE_HIGHLIGHT_MS_PER_KM,
    ),
  )
}

function CenterMapLayers({
  historyActive,
  expandSelectedMapPoints,
  isMapy,
  isOneDark,
  showBuildings3d,
  weatherActive,
  liveTrailShape,
  rideRouteShape,
  accuracyFix,
  accuracyShape,
  gpsBearingDeg,
  rideRoute,
  seekPosition,
  rideTelemetrySamples,
  activeHistoryMapMetric,
  rideMarkers,
  rideGpsSamples,
  mediaAssets,
  mapZoom,
  directionPoint,
  mapPoints,
  selectedMapPointId,
  hiddenMapPointKinds,
  onClearDirectionPoint,
  onToggleMapPointSelection,
  onRemoveMapPoint,
  onSuppressNextMapPress,
  onSelectMarker,
  onOpenMedia,
}: CenterMapLayersProps) {
  const selectedMapPoint = useMemo(
    () =>
      mapPoints.find(
        (point) =>
          point.id === selectedMapPointId && isMapPointKindVisible(point.kind, hiddenMapPointKinds),
      ) ?? null,
    [hiddenMapPointKinds, mapPoints, selectedMapPointId],
  )

  return (
    <>
      {showBuildings3d && (
        <FillExtrusionLayer
          id="center-3d-buildings"
          sourceLayerID="building"
          minZoomLevel={14}
          maxZoomLevel={22}
          style={{
            fillExtrusionColor: isOneDark
              ? theme.neutral.mapBuildingDark
              : theme.neutral.mapBuildingLight,
            fillExtrusionHeight: ['coalesce', ['get', 'height'], 12],
            fillExtrusionBase: ['coalesce', ['get', 'min_height'], 0],
            fillExtrusionOpacity: isOneDark ? 0.65 : 0.42,
            fillExtrusionVerticalGradient: true,
          }}
        />
      )}
      {isMapy ? (
        <RasterSource
          id="center-mapy-tiles"
          tileUrlTemplates={[MAPY_TILE_URL_TEMPLATE]}
          tileSize={256}
          maxZoomLevel={MAP_DEFAULTS.maxZoom}
        >
          <RasterLayer id="center-mapy-tiles-layer" sourceID="center-mapy-tiles" style={{}} />
        </RasterSource>
      ) : null}
      <RainViewerOverlay visible={weatherActive} />
      {historyActive ? (
        <HistoryMapLayers
          rideRouteShape={rideRouteShape}
          rideRoute={rideRoute}
          seekPosition={seekPosition}
          rideTelemetrySamples={rideTelemetrySamples}
          activeHistoryMapMetric={activeHistoryMapMetric}
          rideMarkers={rideMarkers}
          rideGpsSamples={rideGpsSamples}
          mediaAssets={mediaAssets}
          mapZoom={mapZoom}
          onSuppressNextMapPress={onSuppressNextMapPress}
          onSelectMarker={onSelectMarker}
          onOpenMedia={onOpenMedia}
        />
      ) : (
        <LiveMapLayers
          liveTrailShape={liveTrailShape}
          accuracyFix={accuracyFix}
          accuracyShape={accuracyShape}
          gpsBearingDeg={gpsBearingDeg}
        />
      )}
      {directionPoint && !historyActive && (
        <MapPin
          id="center-direction-position"
          coordinate={[directionPoint.longitude, directionPoint.latitude]}
          color={DESTINATION_POINT_COLOR}
          onSelected={() => {
            onSuppressNextMapPress()
            onClearDirectionPoint()
          }}
        />
      )}
      {!historyActive &&
        mapPoints
          .filter(
            (point) =>
              point.kind !== 'direction' && isMapPointKindVisible(point.kind, hiddenMapPointKinds),
          )
          .map((point) => (
            <MapPin
              key={point.id}
              id={`center-map-point-${point.id}`}
              coordinate={[point.longitude, point.latitude]}
              color={getMapPointKindColor(point.kind)}
              icon={getMapPointKindIcon(point.kind)}
              iconColor={getMapPointKindTextColor(point.kind)}
              selected={selectedMapPoint?.id === point.id}
              expandSelected={expandSelectedMapPoints}
              label={getMapPointKindLabel(point.kind)}
              onSelected={() => {
                onSuppressNextMapPress()
                onToggleMapPointSelection(point.id)
              }}
              onRemove={() => {
                onSuppressNextMapPress()
                onRemoveMapPoint(point.id)
              }}
            />
          ))}
    </>
  )
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
  seekPosition: HistoryGpsSample | null
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
    seekPosition,
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

  const gpsFix = liveLocations.at(-1) ?? null
  const previousGpsFix = liveLocations.at(-2) ?? null
  const previousReliableBearing = useMemo(
    () => getReliableGpsBearingFromFixes(liveLocations.slice(0, -1)),
    [liveLocations],
  )
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const lastGpsLatitude = useSettingsStore((s) => s.lastGpsLatitude)
  const lastGpsLongitude = useSettingsStore((s) => s.lastGpsLongitude)
  const persistedFallback = useMemo(
    () =>
      lastGpsLatitude != null && lastGpsLongitude != null
        ? ([lastGpsLongitude, lastGpsLatitude] as [number, number])
        : null,
    [lastGpsLatitude, lastGpsLongitude],
  )
  const selectedMapStyle = MAP_STYLES.find((style) => style.key === mapStyleKey) ?? MAP_STYLES[0]
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
  const phoneHeading = usePhoneHeading(phoneHeadingMode && !historyActive)
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
    phoneHeadingMode && phoneHeadingDeg != null
      ? phoneHeadingDeg - cameraHeading
      : directionBearingDeg == null
        ? null
        : directionBearingDeg - cameraHeading
  const updateNavigationDiagnostics = useNavigationDiagnosticsStore((s) => s.update)

  const handleMapLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setMapLayout((current) =>
      Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height },
    )
  }, [])

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
      setOffscreenMapIndicators((current) => (current.length === 0 ? current : []))
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
              icon: MapPinIcon,
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
        setOffscreenMapIndicators((current) =>
          nearlySameIndicator(current, next) ? current : next,
        )
      })
      .catch(() => {
        if (offscreenProjectionRequestRef.current !== requestId) return
        setOffscreenMapIndicators((current) => (current.length === 0 ? current : []))
      })
  }, [
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
      setOffscreenMapIndicators((current) =>
        repositionOffscreenMapIndicators(current, camera, mapLayout),
      )
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
          gpsBearingDeg={gpsPinBearingDeg}
          rideRoute={rideRoute}
          seekPosition={seekPosition}
          rideTelemetrySamples={rideTelemetrySamples}
          activeHistoryMapMetric={activeHistoryMapMetric}
          rideMarkers={rideMarkers}
          rideGpsSamples={rideGpsSamples}
          mediaAssets={mediaAssets}
          mapZoom={cameraZoom}
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
      {mode === 'telemetry' ? <MapVignette mode={mode} idPrefix="telemetry-map-vignette" /> : null}
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
  offscreenMapIndicator: {
    position: 'absolute',
    width: OFFSCREEN_GPS_INDICATOR_SIZE,
    height: OFFSCREEN_GPS_INDICATOR_SIZE,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offscreenMapIndicatorPressed: {
    opacity: 0.55,
  },
  offscreenMapIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: GPS_POINT_COLOR,
    backgroundColor: theme.neutral.surfaceDeep,
    shadowColor: theme.neutral.surfaceDeep,
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  offscreenMapArrowOrbit: {
    position: 'absolute',
    width: OFFSCREEN_GPS_INDICATOR_SIZE,
    height: OFFSCREEN_GPS_INDICATOR_SIZE,
    alignItems: 'center',
  },
  edgeGuardLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: EDGE_GUARD_WIDTH,
    backgroundColor: theme.neutral.touchInvisible,
    zIndex: 3,
  },
  edgeGuardRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: EDGE_GUARD_WIDTH,
    backgroundColor: theme.neutral.touchInvisible,
    zIndex: 3,
  },
  emptyContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.bg,
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    color: theme.neutral.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  radarAttribution: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    color: theme.neutral.textDimLight,
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: theme.neutral.dimOverlay,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
})

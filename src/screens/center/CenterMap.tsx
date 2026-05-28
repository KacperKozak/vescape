import Mapbox, {
  Camera,
  FillExtrusionLayer,
  FillLayer,
  LineLayer,
  RasterLayer,
  RasterSource,
  ShapeSource,
} from '@rnmapbox/maps'
import {
  ClockCountdownIcon,
  LinkBreakIcon,
  PlugsConnectedIcon,
  StopIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import type { LocationEvent } from 'vesc-ble'

import { InfoModal } from '@/components/InfoModal'
import { MapPin } from '@/components/map/MapPin'
import { RainViewerOverlay } from '@/components/map/RainViewerOverlay'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import {
  BLANK_STYLE,
  MAP_DEFAULTS,
  MAP_STYLES,
  type MapNavigationMode,
  type MapStyleKey,
} from '@/constants/mapStyles'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { theme } from '@/constants/theme'
import {
  getLiveGpsPresentation,
  getReliableGpsBearingFromFixes,
} from '@/helpers/liveGpsPresentation'
import { distanceMeters, makeCircleFeature, makeTrailLineString } from '@/helpers/mapGeometry'
import { findNearestSampleIndexByTime } from '@/lib/history/playback'
import type { HistoryGpsSample, HistoryMarker } from '@/store/historyStore'
import { useSettingsStore } from '@/store/settingsStore'

import {
  type CameraSnapshot,
  type HistoryPreviewTarget,
  useCameraControls,
} from './useCameraControls'
import { getLiveFollowCameraProfile, getPitchForZoom } from './cameraFollowProfile'
import { shouldPreserveLiveFollowGesture } from './cameraGestureState'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

export interface CenterMapHandle {
  recenterLive: (options?: { resetPadding?: boolean }) => void
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
  zoomToLevel: (zoom: number) => void
}

interface SelectedHistoryMarker {
  marker: HistoryMarker
  gps: HistoryGpsSample
}

const RADAR_MAX_ZOOM = 10

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
  app_stop: '#f59e0b',
  connected: theme.gps.color,
  connection_lost: theme.warning.color,
  disconnected: theme.warning.color,
  error: theme.error.color,
  gap: '#eab308',
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

interface CenterMapLayersProps {
  historyActive: boolean
  isMapy: boolean
  isOneDark: boolean
  showBuildings3d: boolean
  weatherActive: boolean
  showRadar: boolean
  liveTrailShape: ReturnType<typeof makeTrailLineString> | null
  rideRouteShape: {
    type: 'Feature'
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    properties: Record<string, never>
  } | null
  accuracyFix: { longitude: number; latitude: number } | null
  accuracyShape: ReturnType<typeof makeCircleFeature> | null
  gpsFix: { longitude: number; latitude: number } | null
  gpsBearingDeg: number | null
  rideRoute: [number, number][]
  seekPosition: HistoryGpsSample | null
  rideMarkers: HistoryMarker[]
  rideGpsSamples: HistoryGpsSample[]
  targetLocation: { latitude: number; longitude: number } | null
  onClearTarget: () => void
  onSelectMarker: (selection: SelectedHistoryMarker) => void
}

function LiveMapLayers({
  liveTrailShape,
  accuracyFix,
  accuracyShape,
  gpsFix,
  gpsBearingDeg,
}: {
  liveTrailShape: CenterMapLayersProps['liveTrailShape']
  accuracyFix: CenterMapLayersProps['accuracyFix']
  accuracyShape: CenterMapLayersProps['accuracyShape']
  gpsFix: CenterMapLayersProps['gpsFix']
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
          {gpsFix && (
            <MapPin
              id="center-gps-position"
              coordinate={[gpsFix.longitude, gpsFix.latitude]}
              color={MAP_DEFAULTS.markerColor}
              bearingDeg={gpsBearingDeg}
            />
          )}
        </>
      )}
    </>
  )
}

function HistoryMapLayers({
  rideRouteShape,
  rideRoute,
  seekPosition,
  rideMarkers,
  rideGpsSamples,
  onSelectMarker,
}: {
  rideRouteShape: CenterMapLayersProps['rideRouteShape']
  rideRoute: CenterMapLayersProps['rideRoute']
  seekPosition: CenterMapLayersProps['seekPosition']
  rideMarkers: CenterMapLayersProps['rideMarkers']
  rideGpsSamples: CenterMapLayersProps['rideGpsSamples']
  onSelectMarker: CenterMapLayersProps['onSelectMarker']
}) {
  return (
    <>
      {rideRouteShape && (
        <ShapeSource id="center-ride-route-source" shape={rideRouteShape}>
          <LineLayer
            id="center-ride-route-line"
            style={{
              lineColor: theme.target.color,
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
      {rideMarkers.map((marker) => {
        const idx = findNearestSampleIndexByTime(rideGpsSamples, marker.occurredAtMs)
        const gps = idx >= 0 ? rideGpsSamples[idx] : null
        if (!gps) return null
        return (
          <MapPin
            key={marker.id}
            id={`center-ride-marker-${marker.id}`}
            coordinate={[gps.longitude, gps.latitude]}
            color={HISTORY_MARKER_COLORS[marker.type]}
            icon={HISTORY_MARKER_ICONS[marker.type]}
            onSelected={() => onSelectMarker({ marker, gps })}
          />
        )
      })}
    </>
  )
}

function CenterMapLayers({
  historyActive,
  isMapy,
  isOneDark,
  showBuildings3d,
  weatherActive,
  showRadar,
  liveTrailShape,
  rideRouteShape,
  accuracyFix,
  accuracyShape,
  gpsFix,
  gpsBearingDeg,
  rideRoute,
  seekPosition,
  rideMarkers,
  rideGpsSamples,
  targetLocation,
  onClearTarget,
  onSelectMarker,
}: CenterMapLayersProps) {
  return (
    <>
      {showBuildings3d && (
        <FillExtrusionLayer
          id="center-3d-buildings"
          sourceLayerID="building"
          minZoomLevel={14}
          maxZoomLevel={22}
          style={{
            fillExtrusionColor: isOneDark ? '#3e4451' : '#e5e7eb',
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
      <RainViewerOverlay visible={weatherActive || showRadar} />
      {historyActive ? (
        <HistoryMapLayers
          rideRouteShape={rideRouteShape}
          rideRoute={rideRoute}
          seekPosition={seekPosition}
          rideMarkers={rideMarkers}
          rideGpsSamples={rideGpsSamples}
          onSelectMarker={onSelectMarker}
        />
      ) : (
        <LiveMapLayers
          liveTrailShape={liveTrailShape}
          accuracyFix={accuracyFix}
          accuracyShape={accuracyShape}
          gpsFix={gpsFix}
          gpsBearingDeg={gpsBearingDeg}
        />
      )}
      {targetLocation && !historyActive && (
        <MapPin
          id="center-target-position"
          coordinate={[targetLocation.longitude, targetLocation.latitude]}
          color={theme.target.color}
          onSelected={onClearTarget}
        />
      )}
    </>
  )
}

interface CenterMapProps {
  liveLocations: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
  rideGpsSamples: HistoryGpsSample[]
  rideMarkers: HistoryMarker[]
  historyActive: boolean
  mapStyleKey: MapStyleKey
  mapNavigationMode: MapNavigationMode
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onLongPressTarget: (target: { latitude: number; longitude: number }) => void
  onMapInteraction: () => void
  targetLocation: { latitude: number; longitude: number } | null
  onClearTarget: () => void
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
    liveLocations,
    latestApproximateLocation,
    rideGpsSamples,
    rideMarkers,
    historyActive,
    mapStyleKey,
    mapNavigationMode,
    rotationLocked,
    perspectiveEnabled,
    onPerspectiveChange,
    onHeadingChange,
    onLongPressTarget,
    onMapInteraction,
    targetLocation,
    weatherActive,
    onClearTarget,
    seekPosition,
    historyPreview,
  },
  ref,
) {
  const styleReloadCameraRef = useRef<CameraSnapshot | null>(null)
  const previousMapStyleKeyRef = useRef(mapStyleKey)
  const mapRevealedRef = useRef(false)
  const [mapOpacity] = useState(() => new Animated.Value(0))
  const [cameraReady, setCameraReady] = useState(false)
  const [selectedHistoryMarker, setSelectedHistoryMarker] = useState<SelectedHistoryMarker | null>(
    null,
  )
  const [showRadar, setShowRadar] = useState(true)
  const [cameraHeading, setCameraHeading] = useState(0)
  const [initialApproximateFix, setInitialApproximateFix] = useState<LocationEvent | null>(null)

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
  const gpsPinBearingDeg = directionBearingDeg == null ? null : directionBearingDeg - cameraHeading
  const gpsHeadingMode = mapNavigationMode === 'gpsHeading'
  const followHeadingDeg = mapNavigationMode === 'gpsHeading' ? (directionBearingDeg ?? 0) : 0

  const rideRoute = useMemo(
    () => rideGpsSamples.map((point) => [point.longitude, point.latitude] as [number, number]),
    [rideGpsSamples],
  )

  const {
    cameraRef,
    currentCameraRef,
    gpsCamera,
    followGps,
    setFollowGps,
    setFollowZoomLevel,
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
    gpsHeadingMode,
    followHeadingDeg,
    onHeadingChange,
    onPerspectiveChange,
  })

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
      onMapInteraction()
      const [longitude, latitude] = feature.geometry.coordinates
      onLongPressTarget({ latitude, longitude })
    },
    [onLongPressTarget, onMapInteraction],
  )

  const handleCameraChanged = useCallback(
    (state: {
      properties: { center: number[]; zoom: number; heading: number; pitch: number }
      gestures: { isGestureActive: boolean }
    }) => {
      const [longitude, latitude] = state.properties.center
      currentCameraRef.current = {
        centerCoordinate: [longitude, latitude],
        zoomLevel: state.properties.zoom,
        heading: state.properties.heading,
        pitch: state.properties.pitch,
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
            gpsHeadingMode,
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
      onHeadingChange(state.properties.heading)
      setShowRadar(state.properties.zoom <= RADAR_MAX_ZOOM)
    },
    [
      cameraRef,
      cameraFix,
      currentCameraRef,
      followGps,
      followHeadingDeg,
      gpsCamera.centerCoordinate,
      gpsHeadingMode,
      historyActive,
      onHeadingChange,
      onMapInteraction,
      perspectiveEnabled,
      setFollowGps,
      setFollowZoomLevel,
    ],
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
      onTouchStart={onMapInteraction}
    >
      <Mapbox.MapView
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
        onPress={onMapInteraction}
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
          isMapy={isMapy}
          isOneDark={isOneDark}
          showBuildings3d={showBuildings3d}
          weatherActive={weatherActive}
          showRadar={showRadar}
          liveTrailShape={liveTrailShape}
          rideRouteShape={rideRouteShape}
          accuracyFix={accuracyFix}
          accuracyShape={accuracyShape}
          gpsFix={gpsFix}
          gpsBearingDeg={gpsPinBearingDeg}
          rideRoute={rideRoute}
          seekPosition={seekPosition}
          rideMarkers={rideMarkers}
          rideGpsSamples={rideGpsSamples}
          targetLocation={targetLocation}
          onClearTarget={onClearTarget}
          onSelectMarker={setSelectedHistoryMarker}
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
      {weatherActive || showRadar ? (
        <Text style={styles.radarAttribution} pointerEvents="none">
          Weather data by RainViewer
        </Text>
      ) : null}
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
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
  edgeGuardRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: EDGE_GUARD_WIDTH,
    backgroundColor: 'rgba(0,0,0,0.001)',
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
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  radarAttribution: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
})

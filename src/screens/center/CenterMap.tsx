import Mapbox, {
  Camera,
  FillExtrusionLayer,
  FillLayer,
  LineLayer,
  RasterLayer,
  RasterSource,
  ShapeSource,
  type Camera as CameraRef,
} from '@rnmapbox/maps'
import {
  ClockCountdownIcon,
  LinkBreakIcon,
  PlugsConnectedIcon,
  StopIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import type { LocationEvent } from 'vesc-ble'

import { InfoModal } from '@/components/InfoModal'
import { MapPin } from '@/components/map/MapPin'
import { RainViewerOverlay } from '@/components/map/RainViewerOverlay'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { BLANK_STYLE, MAP_DEFAULTS, MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { theme } from '@/constants/theme'
import { getLiveGpsPresentation } from '@/helpers/liveGpsPresentation'
import {
  getBounds,
  makeCircleFeature,
  makeTrailLineString,
  zoomLevelForDelta,
} from '@/helpers/mapGeometry'
import { findNearestSampleIndexByTime } from '@/history/playback'
import type { HistoryGpsSample, HistoryMarker } from '@/store/historyStore'
import { useSettingsStore } from '@/store/settingsStore'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

export interface CenterMapHandle {
  recenterLive: (options?: { resetPadding?: boolean }) => void
  previewHistoryLoading: () => void
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

interface CameraSnapshot {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
}

interface SelectedHistoryMarker {
  marker: HistoryMarker
  gps: HistoryGpsSample
}

const MERCATOR_TILE_SIZE = 512
const MAX_MERCATOR_LATITUDE = 85.05112878
const MIN_ZOOM = 0
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function longitudeToWorldX(longitude: number, worldSize: number) {
  return ((longitude + 180) / 360) * worldSize
}

function latitudeToWorldY(latitude: number, worldSize: number) {
  const clampedLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180)
  return (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize
}

function worldXToLongitude(x: number, worldSize: number) {
  return (x / worldSize) * 360 - 180
}

function worldYToLatitude(y: number, worldSize: number) {
  const mercatorY = 0.5 - y / worldSize
  return (180 / Math.PI) * (2 * Math.atan(Math.exp(mercatorY * 2 * Math.PI)) - Math.PI / 2)
}

function getCameraForScreenPan(baseCamera: CameraSnapshot, totalX: number, totalY: number) {
  const worldSize = MERCATOR_TILE_SIZE * 2 ** baseCamera.zoomLevel
  const [longitude, latitude] = baseCamera.centerCoordinate
  const headingRadians = (-baseCamera.heading * Math.PI) / 180
  const worldDeltaX = totalX * Math.cos(headingRadians) - totalY * Math.sin(headingRadians)
  const worldDeltaY = totalX * Math.sin(headingRadians) + totalY * Math.cos(headingRadians)
  const centerX = longitudeToWorldX(longitude, worldSize) - worldDeltaX
  const centerY = latitudeToWorldY(latitude, worldSize) - worldDeltaY

  return {
    ...baseCamera,
    centerCoordinate: [
      worldXToLongitude(centerX, worldSize),
      clamp(worldYToLatitude(centerY, worldSize), -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    ] as [number, number],
  }
}

function getPitchForZoom(zoom: number, perspectiveEnabled: boolean) {
  if (!perspectiveEnabled) return 0
  const progress = clamp(
    (zoom - MAP_DEFAULTS.perspectiveMinZoom) /
      (MAP_DEFAULTS.perspectiveMaxZoom - MAP_DEFAULTS.perspectiveMinZoom),
    0,
    1,
  )
  return progress * MAP_DEFAULTS.activePitch
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

interface CenterMapProps {
  liveLocations: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
  rideGpsSamples: HistoryGpsSample[]
  rideMarkers: HistoryMarker[]
  historyActive: boolean
  mapStyleKey: MapStyleKey
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onLongPressTarget: (target: { latitude: number; longitude: number }) => void
  targetLocation: { latitude: number; longitude: number } | null
  onClearTarget: () => void
  weatherActive: boolean
  seekPosition: HistoryGpsSample | null
}

export const CenterMap = forwardRef<CenterMapHandle, CenterMapProps>(function CenterMap(
  {
    liveLocations,
    latestApproximateLocation,
    rideGpsSamples,
    rideMarkers,
    historyActive,
    mapStyleKey,
    rotationLocked,
    perspectiveEnabled,
    onPerspectiveChange,
    onHeadingChange,
    onLongPressTarget,
    targetLocation,
    weatherActive,
    onClearTarget,
    seekPosition,
  },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null)
  const previewPanBaseRef = useRef<CameraSnapshot | null>(null)
  const previewZoomBaseRef = useRef<CameraSnapshot | null>(null)
  const currentCameraRef = useRef<CameraSnapshot | null>(null)
  const styleReloadCameraRef = useRef<CameraSnapshot | null>(null)
  const previousMapStyleKeyRef = useRef(mapStyleKey)
  const lastCenteredAtRef = useRef<number | null>(null)
  const mapRevealedRef = useRef(false)
  const mapOpacity = useRef(new Animated.Value(0)).current
  const [followGps, setFollowGps] = useState(true)
  const [cameraReady, setCameraReady] = useState(false)
  const [selectedHistoryMarker, setSelectedHistoryMarker] = useState<SelectedHistoryMarker | null>(
    null,
  )
  const [showRadar, setShowRadar] = useState(true)

  const gpsFix = liveLocations.at(-1) ?? null
  const [initialApproximateFix, setInitialApproximateFix] = useState<LocationEvent | null>(null)
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
        latestApproximateFix: latestApproximateLocation,
        initialApproximateFix,
      }),
    [gpsFix, initialApproximateFix, latestApproximateLocation],
  )
  const { cameraFix, accuracyFix, accuracyRadiusM } = gpsPresentation

  useLayoutEffect(() => {
    if (previousMapStyleKeyRef.current === mapStyleKey) return
    previousMapStyleKeyRef.current = mapStyleKey
    styleReloadCameraRef.current = currentCameraRef.current
  }, [mapStyleKey])

  useEffect(() => {
    setInitialApproximateFix(gpsPresentation.nextInitialApproximateFix)
  }, [gpsPresentation.nextInitialApproximateFix])

  const gpsCamera = useMemo(() => {
    if (!cameraFix) {
      return {
        centerCoordinate: persistedFallback ?? MAP_DEFAULTS.fallbackCoordinate,
        zoomLevel:
          persistedFallback == null
            ? MAP_DEFAULTS.fallbackZoom
            : MAP_DEFAULTS.persistedGpsFallbackZoom,
      }
    }
    const baseDelta =
      cameraFix.accuracyM != null
        ? Math.max(MAP_DEFAULTS.zoomDeltaMinAccuracy, cameraFix.accuracyM / 111_000)
        : MAP_DEFAULTS.zoomDeltaFallback
    return {
      centerCoordinate: [cameraFix.longitude, cameraFix.latitude] as [number, number],
      zoomLevel: zoomLevelForDelta(baseDelta * MAP_DEFAULTS.zoomDeltaMultiplier),
    }
  }, [cameraFix, persistedFallback])

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

  const rideRoute = useMemo(
    () => rideGpsSamples.map((point) => [point.longitude, point.latitude] as [number, number]),
    [rideGpsSamples],
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

  const recenterLive = useCallback(
    (options?: { resetPadding?: boolean }) => {
      setFollowGps(true)
      if (!cameraFix) return
      lastCenteredAtRef.current = cameraFix.timestamp
      cameraRef.current?.setCamera({
        ...gpsCamera,
        heading: 0,
        pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
        ...(options?.resetPadding
          ? { padding: { paddingBottom: 0, paddingTop: 0, paddingLeft: 0, paddingRight: 0 } }
          : {}),
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
      onHeadingChange(0)
    },
    [cameraFix, gpsCamera, onHeadingChange, perspectiveEnabled],
  )

  const fitRide = useCallback(() => {
    if (rideRoute.length < 2) return
    const bounds = getBounds(rideRoute)
    cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [90, 40, 120, 40], 700)
  }, [rideRoute])

  const previewHistoryLoading = useCallback(() => {
    setFollowGps(false)
    cameraRef.current?.setCamera({
      ...gpsCamera,
      zoomLevel: Math.max(MAP_DEFAULTS.fallbackZoom, gpsCamera.zoomLevel - 1.2),
      pitch: getPitchForZoom(
        Math.max(MAP_DEFAULTS.fallbackZoom, gpsCamera.zoomLevel - 1.2),
        perspectiveEnabled,
      ),
      animationDuration: MAP_DEFAULTS.animationDuration,
      animationMode: 'easeTo',
    })
  }, [gpsCamera, perspectiveEnabled])

  const restorePreviewPan = useCallback(() => {
    setFollowGps(true)
    const restoreCamera = previewPanBaseRef.current ?? gpsCamera
    previewPanBaseRef.current = null
    // Return to the camera captured when the reveal gesture started.
    if (cameraFix) {
      lastCenteredAtRef.current = cameraFix.timestamp
    }
    cameraRef.current?.setCamera({
      ...restoreCamera,
      pitch: getPitchForZoom(restoreCamera.zoomLevel, perspectiveEnabled),
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [cameraFix, gpsCamera, perspectiveEnabled])

  useImperativeHandle(
    ref,
    () => ({
      recenterLive,
      previewHistoryLoading,
      beginPreviewPan() {
        previewPanBaseRef.current = currentCameraRef.current ?? {
          ...gpsCamera,
          heading: 0,
          pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
        }
        setFollowGps(false)
      },
      previewPanBy(deltaX: number, deltaY: number, animationDuration = 0) {
        setFollowGps(false)
        const baseCamera = previewPanBaseRef.current
        if (!baseCamera) return
        cameraRef.current?.setCamera({
          ...getCameraForScreenPan(baseCamera, deltaX, deltaY),
          pitch: getPitchForZoom(baseCamera.zoomLevel, perspectiveEnabled),
          animationMode: 'linearTo',
          animationDuration,
        })
      },
      beginPreviewZoom() {
        previewZoomBaseRef.current = currentCameraRef.current
        setFollowGps(false)
      },
      previewZoomBy(scale: number) {
        const baseCamera = previewZoomBaseRef.current
        if (!baseCamera || scale <= 0) return
        const zoomLevel = clamp(
          baseCamera.zoomLevel + Math.log2(scale),
          MIN_ZOOM,
          MAP_DEFAULTS.maxZoom,
        )
        cameraRef.current?.setCamera({
          ...baseCamera,
          zoomLevel,
          pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
          animationDuration: 0,
        })
      },
      endPreviewZoom() {
        previewZoomBaseRef.current = null
      },
      restorePreviewPan,
      resetRotation() {
        cameraRef.current?.setCamera({
          heading: 0,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
        onHeadingChange(0)
      },
      togglePerspective() {
        const enabled = !perspectiveEnabled
        onPerspectiveChange(enabled)
        const zoomLevel = currentCameraRef.current?.zoomLevel ?? gpsCamera.zoomLevel
        cameraRef.current?.setCamera({
          pitch: getPitchForZoom(zoomLevel, enabled),
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
      setPadding(bottom: number) {
        cameraRef.current?.setCamera({
          padding: { paddingBottom: bottom, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
          animationDuration: bottom === 0 ? 0 : 300,
          animationMode: 'easeTo',
        })
      },
      zoomToLevel(zoom: number) {
        setFollowGps(false)
        const current = currentCameraRef.current
        cameraRef.current?.setCamera({
          ...(current ? { centerCoordinate: current.centerCoordinate } : {}),
          zoomLevel: zoom,
          pitch: getPitchForZoom(zoom, perspectiveEnabled),
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
    }),
    [
      gpsCamera,
      onHeadingChange,
      onPerspectiveChange,
      perspectiveEnabled,
      previewHistoryLoading,
      recenterLive,
      restorePreviewPan,
    ],
  )

  useEffect(() => {
    if (!cameraFix || !followGps || historyActive) return
    if (lastCenteredAtRef.current === cameraFix.timestamp) return
    lastCenteredAtRef.current = cameraFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [cameraFix, followGps, gpsCamera, historyActive, perspectiveEnabled])

  useEffect(() => {
    if (!historyActive) return
    const frame = requestAnimationFrame(fitRide)
    const timer = setTimeout(fitRide, 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [fitRide, historyActive])

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
    <Animated.View style={[styles.mapContainer, { opacity: mapOpacity }]}>
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
        onDidFinishLoadingMap={() => {
          const styleReloadCamera = styleReloadCameraRef.current
          styleReloadCameraRef.current = null
          const camera = styleReloadCamera ?? gpsCamera
          cameraRef.current?.setCamera({
            ...camera,
            pitch: getPitchForZoom(camera.zoomLevel, perspectiveEnabled),
            animationDuration: 0,
          })
        }}
        onLongPress={(feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          onLongPressTarget({ latitude, longitude })
        }}
        onCameraChanged={(state) => {
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
            setFollowGps(false)
            const dynamicPitch = getPitchForZoom(state.properties.zoom, perspectiveEnabled)
            if (Math.abs(state.properties.pitch - dynamicPitch) > 0.5) {
              cameraRef.current?.setCamera({
                pitch: dynamicPitch,
                animationDuration: 0,
              })
            }
          }
          onHeadingChange(state.properties.heading)
          setShowRadar(state.properties.zoom <= RADAR_MAX_ZOOM)
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            ...gpsCamera,
            pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
          }}
          maxZoomLevel={MAP_DEFAULTS.maxZoom}
          animationMode="easeTo"
        />

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

        {!historyActive && liveTrailShape && (
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

        {historyActive && rideRouteShape && (
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

        {!historyActive && accuracyFix && (
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
              />
            )}
          </>
        )}

        {historyActive && rideRoute[0] && (
          <MapPin id="center-ride-start" coordinate={rideRoute[0]} color={theme.gps.color} />
        )}
        {historyActive && rideRoute.at(-1) && (
          <MapPin id="center-ride-end" coordinate={rideRoute.at(-1)!} color={theme.error.color} />
        )}
        {historyActive &&
          seekPosition &&
          seekPosition.latitude != null &&
          seekPosition.longitude != null && (
            <MapPin
              id="center-seek-position"
              coordinate={[seekPosition.longitude, seekPosition.latitude]}
              color={MAP_DEFAULTS.markerColor}
            />
          )}
        {historyActive &&
          rideMarkers.map((marker) => {
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
                onSelected={() => setSelectedHistoryMarker({ marker, gps })}
              />
            )
          })}

        {targetLocation && !historyActive && (
          <MapPin
            id="center-target-position"
            coordinate={[targetLocation.longitude, targetLocation.latitude]}
            color={theme.target.color}
            onSelected={onClearTarget}
          />
        )}
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
    backgroundColor: '#111827',
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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import Mapbox, {
  Camera,
  FillLayer,
  FillExtrusionLayer,
  LineLayer,
  RasterLayer,
  RasterSource,
  ShapeSource,
  type Camera as CameraRef,
} from '@rnmapbox/maps'
import type { LocationEvent } from 'vesc-ble'

import { MapPin } from '@/components/map/MapPin'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { BLANK_STYLE, MAP_DEFAULTS, MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'
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
  resetRotation: () => void
  togglePerspective: () => void
  setPadding: (bottom: number) => void
}

interface CenterMapProps {
  liveLocations: LocationEvent[]
  rideGpsSamples: HistoryGpsSample[]
  rideMarkers: HistoryMarker[]
  historyActive: boolean
  mapStyleKey: MapStyleKey
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onMapFocus: () => void
  onLongPressTarget: (target: { latitude: number; longitude: number }) => void
  targetLocation: { latitude: number; longitude: number } | null
  onClearTarget: () => void
  seekPosition: HistoryGpsSample | null
}

export const CenterMap = forwardRef<CenterMapHandle, CenterMapProps>(function CenterMap(
  {
    liveLocations,
    rideGpsSamples,
    rideMarkers,
    historyActive,
    mapStyleKey,
    rotationLocked,
    perspectiveEnabled,
    onPerspectiveChange,
    onHeadingChange,
    onMapFocus,
    onLongPressTarget,
    targetLocation,
    onClearTarget,
    seekPosition,
  },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null)
  const lastCenteredAtRef = useRef<number | null>(null)
  const mapRevealedRef = useRef(false)
  const mapOpacity = useRef(new Animated.Value(0)).current
  const [followGps, setFollowGps] = useState(true)
  const [cameraReady, setCameraReady] = useState(false)
  const gpsFix = liveLocations.at(-1) ?? null
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

  const gpsCamera = useMemo(() => {
    if (!gpsFix) {
      return {
        centerCoordinate: persistedFallback ?? MAP_DEFAULTS.fallbackCoordinate,
        zoomLevel:
          persistedFallback == null
            ? MAP_DEFAULTS.fallbackZoom
            : MAP_DEFAULTS.persistedGpsFallbackZoom,
      }
    }
    const baseDelta =
      gpsFix.accuracyM != null
        ? Math.max(MAP_DEFAULTS.zoomDeltaMinAccuracy, gpsFix.accuracyM / 111_000)
        : MAP_DEFAULTS.zoomDeltaFallback
    return {
      centerCoordinate: [gpsFix.longitude, gpsFix.latitude] as [number, number],
      zoomLevel: zoomLevelForDelta(baseDelta * MAP_DEFAULTS.zoomDeltaMultiplier),
    }
  }, [gpsFix, persistedFallback])

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
      gpsFix?.accuracyM != null
        ? makeCircleFeature(gpsFix.longitude, gpsFix.latitude, gpsFix.accuracyM)
        : null,
    [gpsFix],
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
      if (!gpsFix) return
      lastCenteredAtRef.current = gpsFix.timestamp
      cameraRef.current?.setCamera({
        ...gpsCamera,
        ...(options?.resetPadding
          ? { padding: { paddingBottom: 0, paddingTop: 0, paddingLeft: 0, paddingRight: 0 } }
          : {}),
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
    },
    [gpsCamera, gpsFix],
  )

  const fitRide = useCallback(() => {
    if (rideRoute.length < 2) return
    const bounds = getBounds(rideRoute)
    cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [90, 40, 120, 40], 700)
  }, [rideRoute])

  useImperativeHandle(
    ref,
    () => ({
      recenterLive,
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
        cameraRef.current?.setCamera({
          pitch: enabled ? MAP_DEFAULTS.activePitch : 0,
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
    }),
    [onHeadingChange, onPerspectiveChange, perspectiveEnabled, recenterLive],
  )

  useEffect(() => {
    if (!gpsFix || !followGps || historyActive) return
    if (lastCenteredAtRef.current === gpsFix.timestamp) return
    lastCenteredAtRef.current = gpsFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [followGps, gpsCamera, gpsFix, historyActive])

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
        pitchEnabled
        rotateEnabled={!rotationLocked}
        compassEnabled={false}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        onDidFinishLoadingMap={() => {
          cameraRef.current?.setCamera({
            ...gpsCamera,
            pitch: MAP_DEFAULTS.defaultPitch,
            animationDuration: 0,
          })
        }}
        onLongPress={(feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          onLongPressTarget({ latitude, longitude })
        }}
        onCameraChanged={(state) => {
          const [longitude, latitude] = state.properties.center
          const [targetLongitude, targetLatitude] = gpsCamera.centerCoordinate
          if (
            Math.abs(longitude - targetLongitude) < 0.0001 &&
            Math.abs(latitude - targetLatitude) < 0.0001
          ) {
            setCameraReady(true)
          }
          if (state.gestures.isGestureActive) {
            setFollowGps(false)
            onMapFocus()
          }
          onHeadingChange(state.properties.heading)
          onPerspectiveChange(state.properties.pitch > MAP_DEFAULTS.pitchThreshold)
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ ...gpsCamera, pitch: MAP_DEFAULTS.defaultPitch }}
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

        {!historyActive && gpsFix && (
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
              coordinate={[gpsFix.longitude, gpsFix.latitude]}
              color={MAP_DEFAULTS.markerColor}
            />
          </>
        )}

        {historyActive && rideRoute[0] && (
          <MapPin id="center-ride-start" coordinate={rideRoute[0]} color="#22c55e" />
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
                color={marker.type === 'error' ? theme.error.color : '#f59e0b'}
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
      <View style={styles.edgeGuardLeft} pointerEvents="box-only" />
      <View style={styles.edgeGuardRight} pointerEvents="box-only" />
    </Animated.View>
  )
})

const EDGE_GUARD_WIDTH = 40

const styles = StyleSheet.create({
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
})

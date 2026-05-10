import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
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
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { theme } from '@/constants/theme'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { BLANK_STYLE, MAP_DEFAULTS, MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { makeCircleFeature, makeTrailLineString, zoomLevelForDelta } from '@/helpers/mapGeometry'
import { MapPin } from '@/components/map/MapPin'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

interface MapScreenProps {
  active?: boolean
}

export function MapScreen(_props: MapScreenProps) {
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const gpsFix = liveLocations.at(-1) ?? null
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore()
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>('onedark')
  const [followGps, setFollowGps] = useState(true)
  const [heading, setHeading] = useState(0)
  const [rotationLocked, setRotationLocked] = useState(false)
  const [perspectiveEnabled, setPerspectiveEnabled] = useState(true)
  const cameraRef = useRef<CameraRef>(null)
  const lastCenteredAtRef = useRef<number | null>(null)

  const gpsCamera = useMemo(() => {
    if (!gpsFix) {
      return {
        centerCoordinate: MAP_DEFAULTS.fallbackCoordinate,
        zoomLevel: MAP_DEFAULTS.fallbackZoom,
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
  }, [gpsFix])

  const markerColor = !gpsFix ? MAP_DEFAULTS.markerInactiveColor : MAP_DEFAULTS.markerColor
  const selectedMapStyle = MAP_STYLES.find((style) => style.key === mapStyleKey) ?? MAP_STYLES[0]
  const isMapy = selectedMapStyle.key === 'mapy'
  const isOneDark = selectedMapStyle.key === 'onedark'
  const useCustomJSON = isMapy || isOneDark
  const showBuildings3d = selectedMapStyle.key === 'outdoors' || selectedMapStyle.key === 'onedark'

  const accuracyShape = useMemo(
    () =>
      gpsFix?.accuracyM != null
        ? makeCircleFeature(gpsFix.longitude, gpsFix.latitude, gpsFix.accuracyM)
        : null,
    [gpsFix],
  )

  const trailShape = useMemo(
    () => (liveLocations.length >= 2 ? makeTrailLineString(liveLocations) : null),
    [liveLocations],
  )

  useEffect(() => {
    if (!gpsFix || !followGps) return
    if (lastCenteredAtRef.current === gpsFix.timestamp) return
    lastCenteredAtRef.current = gpsFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [followGps, gpsCamera, gpsFix])

  const resetRotation = () => {
    cameraRef.current?.setCamera({
      heading: 0,
      animationDuration: MAP_DEFAULTS.animationDuration,
      animationMode: 'easeTo',
    })
    setHeading(0)
  }

  const recenter = () => {
    setFollowGps(true)
    if (gpsFix) {
      lastCenteredAtRef.current = gpsFix.timestamp
      cameraRef.current?.setCamera({
        ...gpsCamera,
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
    }
  }

  const togglePerspective = () => {
    const enabled = !perspectiveEnabled
    setPerspectiveEnabled(enabled)
    cameraRef.current?.setCamera({
      pitch: enabled ? MAP_DEFAULTS.activePitch : 0,
      animationDuration: MAP_DEFAULTS.animationDuration,
      animationMode: 'easeTo',
    })
  }

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

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={useCustomJSON ? undefined : selectedMapStyle.styleURL}
        styleJSON={isOneDark ? ONE_DARK_MAP_STYLE : isMapy ? BLANK_STYLE : undefined}
        pitchEnabled
        rotateEnabled={!rotationLocked}
        compassEnabled={false}
        scaleBarEnabled
        scaleBarPosition={{ top: 10, left: 10 }}
        logoEnabled={false}
        attributionEnabled={false}
        onLongPress={(feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          setTargetLocation({ latitude, longitude })
        }}
        onCameraChanged={(state) => {
          if (state.gestures.isGestureActive) setFollowGps(false)
          setHeading(state.properties.heading)
          setPerspectiveEnabled(state.properties.pitch > MAP_DEFAULTS.pitchThreshold)
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
            id="outdoors-3d-buildings"
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
            id="mapy-tiles"
            tileUrlTemplates={[MAPY_TILE_URL_TEMPLATE]}
            tileSize={256}
            maxZoomLevel={MAP_DEFAULTS.maxZoom}
          >
            <RasterLayer id="mapy-tiles-layer" sourceID="mapy-tiles" style={{}} />
          </RasterSource>
        ) : null}

        {trailShape && (
          <ShapeSource id="trail-source" shape={trailShape} lineMetrics>
            <LineLayer
              id="trail-line"
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

        {gpsFix && (
          <>
            {accuracyShape && (
              <ShapeSource id="gps-accuracy-source" shape={accuracyShape}>
                <FillLayer
                  id="gps-accuracy-fill"
                  style={{
                    fillColor: MAP_DEFAULTS.accuracyFillColor,
                  }}
                />
              </ShapeSource>
            )}
            <MapPin
              id="gps-position"
              coordinate={[gpsFix.longitude, gpsFix.latitude]}
              color={markerColor}
            />
          </>
        )}
        {targetLocation && (
          <MapPin
            id="target-position"
            coordinate={[targetLocation.longitude, targetLocation.latitude]}
            color={theme.target.color}
            onSelected={clearTargetLocation}
          />
        )}
      </Mapbox.MapView>

      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          {isMapy ? 'Map data: Mapy.com / Seznam.cz' : 'Map data: Mapbox'}
        </Text>
      </View>

      <MapControls
        heading={heading}
        rotationLocked={rotationLocked}
        perspectiveEnabled={perspectiveEnabled}
        followGps={followGps}
        showClearTarget={!!targetLocation}
        onResetRotation={resetRotation}
        onToggleRotationLock={() => setRotationLocked((prev) => !prev)}
        onTogglePerspective={togglePerspective}
        onRecenter={recenter}
        onClearTarget={clearTargetLocation}
      />

      <MapStyleSwitch activeKey={mapStyleKey} onSelect={setMapStyleKey} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  emptyContainer: {
    flex: 1,
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
  map: {
    flex: 1,
  },
  attribution: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(17,24,39,0.38)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  attributionText: {
    color: 'rgba(209,213,219,0.78)',
    fontSize: 9,
    fontWeight: '500',
  },
})

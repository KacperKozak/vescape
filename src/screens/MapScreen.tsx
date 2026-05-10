import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import Mapbox, {
  Camera,
  FillLayer,
  FillExtrusionLayer,
  PointAnnotation,
  RasterLayer,
  RasterSource,
  ShapeSource,
  type Camera as CameraRef,
} from '@rnmapbox/maps'
import {
  ArrowUpIcon,
  CubeIcon,
  CrosshairIcon,
  CrosshairSimpleIcon,
  XIcon,
} from 'phosphor-react-native'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { theme } from '@/constants/theme'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

const FALLBACK_COORDINATE: [number, number] = [17.0385, 51.1079]
const BLANK_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111827' } }],
})
const MAP_STYLES = [
  { key: 'outdoors', label: 'Outdoors', styleURL: Mapbox.StyleURL.Outdoors },
  { key: 'satellite', label: 'Satelite', styleURL: Mapbox.StyleURL.SatelliteStreet },
  { key: 'mapy', label: 'Mapy.cz', styleURL: null },
] as const

type MapStyleKey = (typeof MAP_STYLES)[number]['key']

interface MapScreenProps {
  active?: boolean
}

export function MapScreen(_props: MapScreenProps) {
  const gpsFix = useBleStore((s) => s.recentLocations.at(-1) ?? null)
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore()
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>('outdoors')
  const [followGps, setFollowGps] = useState(true)
  const [heading, setHeading] = useState(0)
  const [rotationLocked, setRotationLocked] = useState(false)
  const [perspectiveEnabled, setPerspectiveEnabled] = useState(false)
  const cameraRef = useRef<CameraRef>(null)
  const lastCenteredAtRef = useRef<number | null>(null)

  const gpsCamera = useMemo(() => {
    if (!gpsFix) {
      return {
        centerCoordinate: FALLBACK_COORDINATE,
        zoomLevel: 11,
      }
    }
    const baseDelta = gpsFix.accuracyM != null ? Math.max(0.002, gpsFix.accuracyM / 111_000) : 0.008
    return {
      centerCoordinate: [gpsFix.longitude, gpsFix.latitude] as [number, number],
      zoomLevel: zoomLevelForDelta(baseDelta * 8),
    }
  }, [gpsFix])

  const markerColor = !gpsFix ? '#9ca3af' : gpsFix.precise ? theme.gps.color : theme.error.color
  const selectedMapStyle = MAP_STYLES.find((style) => style.key === mapStyleKey) ?? MAP_STYLES[0]
  const isMapy = selectedMapStyle.key === 'mapy'
  const showBuildings3d = selectedMapStyle.key === 'outdoors'
  const accuracyShape = useMemo(
    () =>
      gpsFix?.accuracyM != null
        ? makeCircleFeature(gpsFix.longitude, gpsFix.latitude, gpsFix.accuracyM)
        : null,
    [gpsFix],
  )

  useEffect(() => {
    if (!gpsFix || !followGps) return
    if (lastCenteredAtRef.current === gpsFix.timestamp) return
    lastCenteredAtRef.current = gpsFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      animationDuration: 450,
      animationMode: 'easeTo',
    })
  }, [followGps, gpsCamera, gpsFix])

  const resetRotation = () => {
    cameraRef.current?.setCamera({
      heading: 0,
      animationDuration: 350,
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
        animationDuration: 350,
        animationMode: 'easeTo',
      })
    }
  }

  const setPerspective = (enabled: boolean) => {
    setPerspectiveEnabled(enabled)
    cameraRef.current?.setCamera({
      pitch: enabled ? 45 : 0,
      animationDuration: 350,
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
        styleURL={isMapy ? undefined : selectedMapStyle.styleURL}
        styleJSON={isMapy ? BLANK_STYLE : undefined}
        pitchEnabled
        rotateEnabled={!rotationLocked}
        onLongPress={(feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          setTargetLocation({ latitude, longitude })
        }}
        onCameraChanged={(state) => {
          if (state.gestures.isGestureActive) setFollowGps(false)
          setHeading(state.properties.heading)
          setPerspectiveEnabled(state.properties.pitch > 10)
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={gpsCamera}
          maxZoomLevel={19}
          animationMode="easeTo"
        />

        {showBuildings3d && (
          <FillExtrusionLayer
            id="outdoors-3d-buildings"
            sourceLayerID="building"
            minZoomLevel={14}
            maxZoomLevel={22}
            style={{
              fillExtrusionColor: '#e5e7eb',
              fillExtrusionHeight: ['coalesce', ['get', 'height'], 12],
              fillExtrusionBase: ['coalesce', ['get', 'min_height'], 0],
              fillExtrusionOpacity: 0.42,
              fillExtrusionVerticalGradient: true,
            }}
          />
        )}

        {isMapy ? (
          <RasterSource
            id="mapy-tiles"
            tileUrlTemplates={[MAPY_TILE_URL_TEMPLATE]}
            tileSize={256}
            maxZoomLevel={19}
          >
            <RasterLayer id="mapy-tiles-layer" sourceID="mapy-tiles" style={{}} />
          </RasterSource>
        ) : null}

        {gpsFix && (
          <>
            {accuracyShape && (
              <ShapeSource id="gps-accuracy-source" shape={accuracyShape}>
                <FillLayer
                  id="gps-accuracy-fill"
                  style={{
                    fillColor: gpsFix.precise ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
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

      <View style={styles.overlayTop}>
        <Text style={styles.overlayTopText}>
          {!gpsFix
            ? 'Waiting for GPS fix'
            : gpsFix.accuracyM != null
              ? `GPS ±${gpsFix.accuracyM.toFixed(1)}m`
              : 'GPS fix'}
        </Text>
      </View>

      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          {isMapy ? 'Map data: Mapy.com / Seznam.cz' : 'Map data: Mapbox'}
        </Text>
      </View>

      {targetLocation && (
        <Pressable style={styles.clearTargetButton} onPress={clearTargetLocation}>
          <XIcon size={18} color="#f9fafb" weight="bold" />
        </Pressable>
      )}

      <Pressable
        style={[styles.compassButton, rotationLocked && styles.compassButtonLocked]}
        onPress={resetRotation}
        onLongPress={() => setRotationLocked((prev) => !prev)}
        delayLongPress={400}
      >
        <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
          <ArrowUpIcon
            size={22}
            color={rotationLocked ? theme.warning.color : '#f9fafb'}
            weight="bold"
          />
        </View>
      </Pressable>

      <Pressable
        style={[styles.perspectiveButton, perspectiveEnabled && styles.perspectiveButtonActive]}
        onPress={() => setPerspective(!perspectiveEnabled)}
      >
        <CubeIcon
          size={22}
          color={perspectiveEnabled ? theme.gps.text : '#f9fafb'}
          weight={perspectiveEnabled ? 'fill' : 'bold'}
        />
      </Pressable>

      <Pressable
        style={[styles.followButton, followGps && styles.followButtonActive]}
        onPress={recenter}
      >
        {followGps ? (
          <CrosshairIcon size={24} color={theme.gps.text} weight="fill" />
        ) : (
          <CrosshairSimpleIcon size={24} color="#f9fafb" weight="bold" />
        )}
      </Pressable>

      <View style={styles.providerSwitch}>
        {MAP_STYLES.map((style) => (
          <Pressable
            key={style.key}
            style={[
              styles.providerButton,
              mapStyleKey === style.key && styles.providerButtonActive,
            ]}
            onPress={() => setMapStyleKey(style.key)}
          >
            <Text
              style={[
                styles.providerButtonText,
                mapStyleKey === style.key && styles.providerButtonTextActive,
              ]}
            >
              {style.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function MapPin({
  id,
  coordinate,
  color,
  onSelected,
}: {
  id: string
  coordinate: [number, number]
  color: string
  onSelected?: () => void
}) {
  return (
    <PointAnnotation id={id} coordinate={coordinate} onSelected={onSelected}>
      <View style={[styles.pin, { borderColor: color }]}>
        <View style={[styles.pinCore, { backgroundColor: color }]} />
      </View>
    </PointAnnotation>
  )
}

function zoomLevelForDelta(delta: number): number {
  return Math.max(3, Math.min(19, Math.log2(360 / Math.max(delta, 0.0001))))
}

function makeCircleFeature(
  longitude: number,
  latitude: number,
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const earthRadiusM = 6_378_137
  const latRad = (latitude * Math.PI) / 180
  const coordinates: [number, number][] = []
  for (let i = 0; i <= 64; i += 1) {
    const bearing = (i / 64) * Math.PI * 2
    const latOffset = (radiusM / earthRadiusM) * Math.cos(bearing)
    const lonOffset = (radiusM / (earthRadiusM * Math.cos(latRad))) * Math.sin(bearing)
    coordinates.push([
      longitude + (lonOffset * 180) / Math.PI,
      latitude + (latOffset * 180) / Math.PI,
    ])
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: {},
  }
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
  pin: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 3,
    backgroundColor: '#f9fafb',
  },
  pinCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  overlayTop: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.85)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  overlayTopText: {
    color: '#f3f4f6',
    fontSize: 12,
    fontWeight: '600',
  },
  attribution: {
    position: 'absolute',
    left: 12,
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
  clearTargetButton: {
    position: 'absolute',
    right: 12,
    bottom: 226,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,19,56,0.9)',
    borderRadius: 26,
  },
  compassButton: {
    position: 'absolute',
    right: 12,
    bottom: 106,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 26,
  },
  compassButtonLocked: {
    backgroundColor: 'rgba(67,20,7,0.9)',
  },
  perspectiveButton: {
    position: 'absolute',
    right: 12,
    bottom: 166,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 26,
  },
  perspectiveButtonActive: {
    backgroundColor: theme.gps.bg,
  },
  followButton: {
    position: 'absolute',
    right: 12,
    bottom: 46,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 26,
  },
  followButtonActive: {
    backgroundColor: theme.gps.bg,
  },
  providerSwitch: {
    position: 'absolute',
    left: 12,
    bottom: 46,
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  providerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  providerButtonActive: {
    backgroundColor: '#2563eb',
  },
  providerButtonText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
  },
  providerButtonTextActive: {
    color: '#f9fafb',
  },
})

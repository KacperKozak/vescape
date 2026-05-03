import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import MapView, { Circle, Marker, UrlTile, type Region } from 'react-native-maps'
import { ArrowUpIcon, CrosshairIcon, CrosshairSimpleIcon, XIcon } from 'phosphor-react-native'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { GOOGLE_MAPS_API_KEY, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { theme } from '@/constants/theme'

export function MapScreen() {
  const gpsFix = useBleStore((s) => s.gpsFix)
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore()
  const [mapProvider, setMapProvider] = useState<'mapy' | 'google'>('google')
  const [followGps, setFollowGps] = useState(true)
  const [heading, setHeading] = useState(0)
  const [rotationLocked, setRotationLocked] = useState(false)
  const mapRef = useRef<MapView>(null)
  const lastCenteredAtRef = useRef<number | null>(null)

  const gpsRegion = useMemo<Region>(() => {
    if (!gpsFix) {
      // Default fallback around Wroclaw until first GPS fix arrives.
      return {
        latitude: 51.1079,
        longitude: 17.0385,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    }
    const baseDelta = gpsFix.accuracyM != null ? Math.max(0.002, gpsFix.accuracyM / 111_000) : 0.008
    return {
      latitude: gpsFix.latitude,
      longitude: gpsFix.longitude,
      latitudeDelta: baseDelta * 8,
      longitudeDelta: baseDelta * 8,
    }
  }, [gpsFix])

  const markerColor = !gpsFix ? '#9ca3af' : gpsFix.precise ? theme.gps.color : theme.error.color

  useEffect(() => {
    if (!gpsFix || !followGps) return
    if (lastCenteredAtRef.current === gpsFix.timestamp) return
    lastCenteredAtRef.current = gpsFix.timestamp
    mapRef.current?.animateToRegion(gpsRegion, 450)
  }, [followGps, gpsFix, gpsRegion])

  const resetRotation = async () => {
    const cam = await mapRef.current?.getCamera()
    if (cam) mapRef.current?.animateCamera({ ...cam, heading: 0 }, { duration: 350 })
    setHeading(0)
  }

  const recenter = () => {
    setFollowGps(true)
    if (gpsFix) {
      lastCenteredAtRef.current = gpsFix.timestamp
      mapRef.current?.animateToRegion(gpsRegion, 350)
    }
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Map unavailable</Text>
        <Text style={styles.emptyText}>
          Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild Android to initialize react-native-maps.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapProvider === 'mapy' ? 'none' : 'standard'}
        initialRegion={gpsRegion}
        rotateEnabled={!rotationLocked}
        onPanDrag={() => setFollowGps(false)}
        onLongPress={(e) => setTargetLocation(e.nativeEvent.coordinate)}
        onRegionChangeComplete={async (_, gesture) => {
          if (gesture?.isGesture) setFollowGps(false)
          const cam = await mapRef.current?.getCamera()
          if (cam?.heading != null) setHeading(cam.heading)
        }}
      >
        {mapProvider === 'mapy' && (
          <UrlTile urlTemplate={MAPY_TILE_URL_TEMPLATE} maximumZ={19} flipY={false} zIndex={0} />
        )}

        {gpsFix && (
          <>
            <Marker
              coordinate={{ latitude: gpsFix.latitude, longitude: gpsFix.longitude }}
              pinColor={markerColor}
            />
            {gpsFix.accuracyM != null && (
              <Circle
                center={{ latitude: gpsFix.latitude, longitude: gpsFix.longitude }}
                radius={gpsFix.accuracyM}
                strokeColor={gpsFix.precise ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)'}
                fillColor={gpsFix.precise ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}
              />
            )}
          </>
        )}
        {targetLocation && (
          <Marker
            coordinate={targetLocation}
            pinColor={theme.target.color}
            onPress={clearTargetLocation}
          />
        )}
      </MapView>

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
          {mapProvider === 'mapy' ? 'Map data: Mapy.com / Seznam.cz' : 'Map data: Google'}
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
        <Pressable
          style={[styles.providerButton, mapProvider === 'google' && styles.providerButtonActive]}
          onPress={() => setMapProvider('google')}
        >
          <Text
            style={[
              styles.providerButtonText,
              mapProvider === 'google' && styles.providerButtonTextActive,
            ]}
          >
            Google Maps
          </Text>
        </Pressable>
        <Pressable
          style={[styles.providerButton, mapProvider === 'mapy' && styles.providerButtonActive]}
          onPress={() => setMapProvider('mapy')}
        >
          <Text
            style={[
              styles.providerButtonText,
              mapProvider === 'mapy' && styles.providerButtonTextActive,
            ]}
          >
            Mapy.cz
          </Text>
        </Pressable>
      </View>
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
    bottom: 166,
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

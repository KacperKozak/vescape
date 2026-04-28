import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import MapView, { Circle, Marker, UrlTile } from 'react-native-maps'
import { useBleStore } from '@/src/store/bleStore'
import { GOOGLE_MAPS_API_KEY, MAPY_TILE_URL_TEMPLATE } from '@/src/config/mapy'

export function MapScreen() {
  const gpsFix = useBleStore((s) => s.gpsFix)
  const [mapProvider, setMapProvider] = useState<'mapy' | 'google'>('mapy')

  const region = useMemo(() => {
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

  const markerColor = !gpsFix ? '#9ca3af' : gpsFix.precise ? '#22c55e' : '#ef4444'

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
        style={styles.map}
        mapType={mapProvider === 'mapy' ? 'none' : 'standard'}
        region={region}
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
                strokeColor={gpsFix.precise ? 'rgba(59,130,246,0.9)' : 'rgba(239,68,68,0.9)'}
                fillColor={gpsFix.precise ? 'rgba(59,130,246,0.18)' : 'rgba(239,68,68,0.18)'}
              />
            )}
          </>
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

      <View style={styles.providerSwitch}>
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
    right: 10,
    bottom: 58,
    backgroundColor: 'rgba(17,24,39,0.82)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  attributionText: {
    color: '#d1d5db',
    fontSize: 10,
  },
  providerSwitch: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  providerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    paddingVertical: 9,
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

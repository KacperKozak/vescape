import { StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { TelemetryCard } from '@/components/TelemetryCard'
import { DASH } from '@/helpers/format'
import { bearingTo, clockHour, fmtDistance, haversineM } from '@/helpers/geo'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'

export function TargetSection() {
  const targetLocation = useMapStore((s) => s.targetLocation)
  const gpsFix = useBleStore(useShallow((s) => s.recentLocations.at(-1) ?? null))

  if (!targetLocation) return null

  const distanceM = gpsFix ? haversineM(gpsFix, targetLocation) : null
  const bearing = gpsFix ? bearingTo(gpsFix, targetLocation) : null
  const clock =
    gpsFix?.bearingDeg != null && bearing != null ? clockHour(gpsFix.bearingDeg, bearing) : null

  return (
    <>
      <Text style={styles.sectionLabel}>TARGET</Text>
      <View style={styles.row}>
        <TelemetryCard label="Distance" value={distanceM != null ? fmtDistance(distanceM) : DASH} />
        <TelemetryCard
          label="Direction"
          value={bearing != null ? `${Math.round(bearing)}°` : DASH}
          sub={clock != null ? `${clock} o'clock` : undefined}
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 4,
    marginLeft: 4,
  },
  row: { flexDirection: 'row', marginBottom: 4 },
})

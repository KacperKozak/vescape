import { StyleSheet, Text, View } from 'react-native'

import { TuneDial } from '@/components/ui/tune/TuneDial'
import { theme } from '@/constants/theme'

interface TunePreviewScenarioControlsProps {
  speedKmh: number
  onSpeedChange: (speedKmh: number) => void
}

export function TunePreviewScenarioControls({
  speedKmh,
  onSpeedChange,
}: TunePreviewScenarioControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Preview scenario</Text>
        <Text style={styles.value}>{speedKmh.toFixed(0)} km/h</Text>
      </View>
      <Text style={styles.description}>Forward speed · reference 11-inch wheel</Text>
      <TuneDial
        value={speedKmh}
        min={0}
        max={40}
        step={1}
        unit="km/h"
        valueChangeMode="live"
        onValueChange={onSpeedChange}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.palette.slate.textPrimary, fontSize: 13, fontWeight: '900' },
  value: {
    color: theme.palette.sky.text,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  description: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '600' },
})

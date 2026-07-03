import { StyleSheet, Switch, Text, View } from 'react-native'
import { GaugeIcon, MountainsIcon } from 'phosphor-react-native'

import { TuneDial } from '@/components/ui/tune/TuneDial'
import { theme } from '@/constants/theme'

interface TunePreviewScenarioControlsProps {
  speedKmh: number
  onSpeedChange: (speedKmh: number) => void
  hillsEnabled: boolean
  onHillsChange: (enabled: boolean) => void
  hillHeightMeters: number
  onHillHeightChange: (value: number) => void
  hillSpacingMeters: number
  onHillSpacingChange: (value: number) => void
}

export function TunePreviewScenarioControls({
  speedKmh,
  onSpeedChange,
  hillsEnabled,
  onHillsChange,
  hillHeightMeters,
  onHillHeightChange,
  hillSpacingMeters,
  onHillSpacingChange,
}: TunePreviewScenarioControlsProps) {
  return (
    <View style={styles.stack}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <GaugeIcon size={16} color={theme.telemetry.speed} weight="duotone" />
            <Text style={styles.title}>Constant speed</Text>
          </View>
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

      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <MountainsIcon size={16} color={theme.palette.green.color} weight="duotone" />
            <Text style={styles.title}>Hills</Text>
          </View>
          <Switch value={hillsEnabled} onValueChange={onHillsChange} />
        </View>
        {hillsEnabled ? (
          <>
            <Text style={styles.description}>Height · {hillHeightMeters.toFixed(1)} m</Text>
            <TuneDial
              value={hillHeightMeters}
              min={0}
              max={20}
              step={0.1}
              unit="m"
              valueChangeMode="live"
              onValueChange={onHillHeightChange}
            />
            <Text style={styles.description}>Spacing · {hillSpacingMeters.toFixed(0)} m</Text>
            <TuneDial
              value={hillSpacingMeters}
              min={2}
              max={100}
              step={1}
              unit="m"
              valueChangeMode="live"
              onValueChange={onHillSpacingChange}
            />
          </>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 8,
  },
  container: {
    gap: 4,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: theme.palette.slate.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: theme.palette.slate.textPrimary, fontSize: 13, fontWeight: '900' },
  value: {
    color: theme.palette.sky.text,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  description: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '600' },
})

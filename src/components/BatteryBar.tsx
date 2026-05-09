import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'

interface Props {
  /** Current battery state-of-charge in percent (0–100), or null if unknown. */
  percent: number | null
  /** Current pack voltage (smoothed). */
  voltage: number | null
  /** Last 10 min battery % series (already smoothed). */
  series?: SparklinePoint[]
  /** Fixed time window in ms for the sparkline x-axis. */
  windowMs?: number
  /** Hint text shown when voltage limits aren't configured yet. */
  hint?: string
}

const BATTERY_LOW_PCT = 30
const PCT_RANGE = { min: 0, max: 100 }

function pickColor(percent: number | null): string {
  if (percent != null && percent < BATTERY_LOW_PCT) return theme.warning.color
  return theme.gps.color
}

/**
 * Compact battery indicator: tiny "BATTERY" label, 10-min sparkline filling
 * the middle, % + voltage on the right. Sits at the top of the telemetry view.
 */
export function BatteryBar({ percent, voltage, series, windowMs, hint }: Props) {
  const color = pickColor(percent)
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <Text style={styles.label}>BATTERY</Text>
        {voltage != null ? <Text style={styles.voltage}>{voltage.toFixed(1)} V</Text> : null}
      </View>
      <View style={styles.middle}>
        {series && series.length > 1 ? (
          <Sparkline
            points={series}
            color={color}
            height={28}
            range={PCT_RANGE}
            windowMs={windowMs}
          />
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>
      <Text style={styles.percent} numberOfLines={1}>
        {percent != null ? (
          <>
            {Math.round(percent)}
            <Text style={styles.percentUnit}> %</Text>
          </>
        ) : (
          '—'
        )}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 6,
    gap: 12,
  },
  left: {
    alignItems: 'flex-start',
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  percent: {
    color: '#f1f5f9',
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 24,
  },
  percentUnit: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
  },
  voltage: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  hint: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
})

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'

interface Props {
  label: string
  value: string
  unit?: string
  /** Small secondary text shown below the value */
  sub?: string
  /** Optional last-10-min sparkline. */
  series?: SparklinePoint[]
  seriesColor?: string
  /** Pass to render max-marker + badge. Omit for clean line only. */
  fmtMax?: (value: number) => string
  /** Fixed Y range for the sparkline. */
  range?: { min: number; max: number }
  /** Min Y span for auto-range (smooths small jitter). */
  minSpan?: number
}

/** A single telemetry value tile. */
export const TelemetryCard = React.memo(function TelemetryCard({
  label,
  value,
  unit,
  sub,
  series,
  seriesColor,
  fmtMax,
  range,
  minSpan,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
        {sub ? <Text style={styles.sub}> {sub}</Text> : null}
      </Text>
      {series && series.length > 1 ? (
        <Sparkline
          points={series}
          color={seriesColor ?? theme.wheel.color}
          height={18}
          fmtMax={fmtMax}
          range={range}
          minSpan={minSpan}
        />
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    margin: 4,
    gap: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 24,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  unit: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '400',
  },
  sub: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
})

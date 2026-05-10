import React, { useMemo } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'
import { useAlertsStore } from '@/store/alertsStore'

const CONTROL_UNITS: Record<string, string> = {
  duty: '%',
  'motor-temp': '°C',
  'controller-temp': '°C',
  'motor-current': 'A',
  'batt-current': 'A',
}

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
  /** When set, shows a yellow warning badge if enabled alert rules exist for this controlId. */
  controlId?: string
  /** Fixed time window in ms for sparkline x-axis. */
  windowMs?: number
  animatedValue?: SharedValue<number | null>
  animatedDecimals?: number
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

function AnimatedTelemetryValue({
  value,
  decimals = 1,
  unit,
}: {
  value: SharedValue<number | null>
  decimals?: number
  unit?: string
}) {
  const animatedProps = useAnimatedProps(() => {
    const current = value.value
    const text = current == null ? '-' : current.toFixed(decimals)
    return { text, value: text }
  })

  return (
    <View style={styles.valueRow}>
      <AnimatedTextInput
        editable={false}
        animatedProps={animatedProps}
        style={[styles.value, styles.animatedValue]}
      />
      {unit ? <Text style={styles.unit}> {unit}</Text> : null}
    </View>
  )
}

export function AlertBadge({ controlId }: { controlId: string }) {
  const rules = useAlertsStore((s) => s.rules)
  const enabledRules = useMemo(
    () => rules.filter((r) => r.controlId === controlId && r.enabled),
    [rules, controlId],
  )
  if (enabledRules.length === 0) return null

  const unit = CONTROL_UNITS[controlId] ?? ''
  const label = enabledRules
    .map((r) =>
      r.thresholdMax != null ? `${r.threshold}–${r.thresholdMax}${unit}` : `${r.threshold}${unit}`,
    )
    .join(', ')

  return (
    <View style={styles.alertBadge}>
      <Text style={styles.alertBadgeText}>{label}</Text>
    </View>
  )
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
  controlId,
  windowMs,
  animatedValue,
  animatedDecimals,
}: Props) {
  return (
    <View style={styles.card}>
      {controlId && (
        <View style={styles.alertBadgeContainer}>
          <AlertBadge controlId={controlId} />
        </View>
      )}
      <Text style={styles.label}>{label}</Text>
      {animatedValue ? (
        <AnimatedTelemetryValue value={animatedValue} decimals={animatedDecimals} unit={unit} />
      ) : (
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
          {unit ? <Text style={styles.unit}> {unit}</Text> : null}
          {sub ? <Text style={styles.sub}> {sub}</Text> : null}
        </Text>
      )}
      {series && series.length > 1 ? (
        <Sparkline
          points={series}
          color={seriesColor ?? theme.wheel.color}
          height={18}
          fmtMax={fmtMax}
          range={range}
          minSpan={minSpan}
          windowMs={windowMs}
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
    padding: 0,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  animatedValue: {
    minWidth: 0,
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
  alertBadgeContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  alertBadgeText: {
    color: 'rgba(250, 204, 21, 0.5)',
    fontSize: 8,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
})

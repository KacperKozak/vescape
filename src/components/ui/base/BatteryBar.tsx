import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/ui/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { interaction, theme } from '@/constants/theme'

interface Props {
  /** Current battery state-of-charge in percent (0–100), or null if unknown. */
  percent: number | null
  /** Current pack voltage (smoothed). */
  voltage: number | null
  /** Last 10 min battery % series (already smoothed). */
  series?: SparklinePoint[]
  /** Fixed time window in ms for the sparkline x-axis. */
  windowMs?: number
  /** Y-axis range for the sparkline. Defaults to 0–100%. */
  range?: { min: number; max: number }
  /** Hint text shown when voltage limits aren't configured yet. */
  hint?: string
  compact?: boolean
  transparent?: boolean
  containerStyle?: StyleProp<ViewStyle>
  /** Callback when the bar is pressed. Omit to render a non-interactive view. */
  onPress?: () => void
}

const BATTERY_LOW_PCT = 30
const PCT_RANGE = { min: 0, max: 100 }

function pickColor(percent: number | null): string {
  if (percent != null && percent < BATTERY_LOW_PCT) return theme.warning.color
  return telemetry.battVoltage.color
}

export function BatteryBar({
  percent,
  voltage,
  series,
  windowMs,
  range = PCT_RANGE,
  hint,
  compact,
  transparent,
  containerStyle,
  onPress,
}: Props) {
  const color = pickColor(percent)
  const content = (
    <>
      <View style={styles.topRow}>
        <View style={styles.left}>
          {voltage != null ? (
            <Text style={styles.voltage}>{telemetry.battVoltage.formatWithUnit(voltage)}</Text>
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
      <Sparkline
        points={series ?? []}
        color={color}
        height={compact ? 18 : 24}
        range={range}
        windowMs={windowMs}
      />
      {hint && !series?.length ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  )

  const style = [
    styles.wrap,
    compact && styles.wrapCompact,
    transparent && styles.wrapTransparent,
    containerStyle,
  ]

  if (!onPress) {
    return (
      <View testID="battery-bar" style={style}>
        {content}
      </View>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      android_ripple={interaction.ripple}
      testID="battery-bar"
      style={style}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 6,
    gap: 6,
  },
  wrapCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 0,
    marginBottom: 0,
    gap: 4,
  },
  wrapTransparent: {
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    alignItems: 'flex-start',
  },
  label: {
    color: theme.neutral.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  percent: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '700',
    lineHeight: 18,
  },
  percentUnit: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  voltage: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  hint: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
})

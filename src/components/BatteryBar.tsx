import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { interaction, theme } from '@/constants/theme'
import { routes } from '@/navigation/routes'

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
  compact?: boolean
  transparent?: boolean
  containerStyle?: StyleProp<ViewStyle>
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
  hint,
  compact,
  transparent,
  containerStyle,
}: Props) {
  const color = pickColor(percent)
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push(routes.controlBattery)}
      android_ripple={interaction.ripple}
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        transparent && styles.wrapTransparent,
        containerStyle,
      ]}
    >
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
        range={PCT_RANGE}
        windowMs={windowMs}
      />
      {hint && !series?.length ? <Text style={styles.hint}>{hint}</Text> : null}
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

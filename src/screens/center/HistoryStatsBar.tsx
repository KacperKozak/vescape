import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  BatteryChargingIcon,
  BatteryMediumIcon,
  CaretDownIcon,
  CaretUpIcon,
  ClockCountdownIcon,
  GaugeIcon,
  LightningIcon,
  RepeatIcon,
  RoadHorizonIcon,
  ThermometerHotIcon,
  ThermometerSimpleIcon,
  WaveformIcon,
} from 'phosphor-react-native'
import type { Icon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { HistorySession } from '@/store/historyStore'
import { rideDurationMs } from '@/lib/history/sessions'
import { interaction, theme } from '@/constants/theme'

interface HistoryStatsBarProps {
  session: HistorySession | null
}

interface StatItem {
  key: string
  label: string
  value: string
  icon: Icon
  accent: string
}

export function HistoryStatsBar({ session }: HistoryStatsBarProps) {
  const insets = useSafeAreaInsets()
  const [expanded, setExpanded] = useState(false)
  const stats = useMemo(() => sessionToStats(session), [session])
  const primaryStats = stats.slice(0, 4)
  const secondaryStats = stats.slice(4)

  return (
    <View style={[styles.wrap, { top: Math.max(insets.top, 8) + 46 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? 'Collapse ride stats' : 'Expand ride stats'}
        onPress={() => setExpanded((value) => !value)}
        android_ripple={interaction.ripple}
        style={styles.bar}
      >
        {expanded ? (
          <View style={styles.expandedPanel}>
            <View style={styles.row}>
              {primaryStats.map((item) => (
                <CompactStat key={item.key} item={item} />
              ))}
              <View style={styles.toggleCell}>
                <View style={styles.expandedToggle}>
                  <CaretUpIcon size={16} color={theme.palette.slate.textSecondary} weight="bold" />
                </View>
              </View>
            </View>
            <View style={styles.row}>
              {secondaryStats.map((item) => (
                <CompactStat key={item.key} item={item} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            {primaryStats.map((item) => (
              <CompactStat key={item.key} item={item} />
            ))}
            <View style={styles.toggleCell}>
              <View style={styles.toggle}>
                <CaretDownIcon size={16} color={theme.palette.slate.textSecondary} weight="bold" />
              </View>
            </View>
          </View>
        )}
      </Pressable>
    </View>
  )
}

interface CompactStatProps {
  item: StatItem
}

function CompactStat({ item }: CompactStatProps) {
  const IconComponent = item.icon
  return (
    <View style={styles.compactCell} pointerEvents="none">
      <Text style={styles.compactLabel} numberOfLines={1} adjustsFontSizeToFit>
        {item.label}
      </Text>
      <View style={styles.valueRow}>
        <IconComponent size={14} color={item.accent} weight="duotone" style={styles.icon} />
        <Text style={styles.compactValue} numberOfLines={1} adjustsFontSizeToFit>
          {item.value}
        </Text>
      </View>
    </View>
  )
}

function sessionToStats(session: HistorySession | null): StatItem[] {
  return [
    {
      key: 'distance',
      label: 'Distance',
      value: session ? formatDistance(session.distanceM) : '',
      icon: RoadHorizonIcon,
      accent: theme.palette.sky.color,
    },
    {
      key: 'topSpeed',
      label: 'Top Speed',
      value: session ? formatSpeed(session.maxSpeedKmh) : '',
      icon: GaugeIcon,
      accent: theme.telemetry.speed,
    },
    {
      key: 'avgSpeed',
      label: 'Avg Speed',
      value: session ? formatSpeed(session.avgSpeedKmh) : '',
      icon: RepeatIcon,
      accent: theme.palette.teal.color,
    },
    {
      key: 'rideTime',
      label: 'Time',
      value: session ? formatDuration(rideDurationMs(session)) : '',
      icon: ClockCountdownIcon,
      accent: theme.palette.purple.color,
    },
    {
      key: 'mosfetTemp',
      label: 'Ctrl Max',
      value: session ? formatTemp(session.maxTempMosfet) : '',
      icon: ThermometerHotIcon,
      accent: theme.telemetry.controllerTemp,
    },
    {
      key: 'motorTemp',
      label: 'Motor Max',
      value: session ? formatTemp(session.maxTempMotor) : '',
      icon: ThermometerSimpleIcon,
      accent: theme.telemetry.motorTemp,
    },
    {
      key: 'batteryUsed',
      label: 'Used',
      value: session ? formatWh(session.batteryUsedWh) : '',
      icon: BatteryMediumIcon,
      accent: theme.status.warning.color,
    },
    {
      key: 'batteryRegen',
      label: 'Regen',
      value: session ? formatWh(session.batteryRegenWh) : '',
      icon: BatteryChargingIcon,
      accent: theme.palette.green.color,
    },
    {
      key: 'samples',
      label: 'Points',
      value: session ? formatCount(session.sampleCount) : '',
      icon: WaveformIcon,
      accent: theme.palette.cyan.color,
    },
    {
      key: 'maxDuty',
      label: 'Max Duty',
      value: session ? formatDuty(session.maxDuty) : '',
      icon: LightningIcon,
      accent: theme.telemetry.duty,
    },
  ]
}

function formatCount(value: number): string {
  if (value < 1000) return String(value)
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`
  return `${Math.round(value / 1000)}k`
}

function formatDistance(valueM: number | null): string {
  if (valueM == null) return '-'
  if (valueM < 1000) return `${Math.round(valueM)} m`
  return `${(valueM / 1000).toFixed(1)} km`
}

function formatDuration(valueMs: number): string {
  const totalMinutes = Math.max(1, Math.round(valueMs / 60_000))
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

function formatSpeed(valueKmh: number): string {
  return `${Math.round(valueKmh)} km/h`
}

function formatTemp(value: number | null): string {
  if (value == null) return '-'
  return `${Math.round(value)}°C`
}

function formatDuty(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatWh(value: number): string {
  if (value < 1) return `${(value * 1000).toFixed(0)} mWh`
  return `${value.toFixed(1)} Wh`
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 24,
    paddingTop: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  compactValue: {
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
  },
  compactLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'left',
  },
  compactCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    justifyContent: 'center',
    gap: 3,
    paddingRight: 4,
  },
  icon: {
    flexShrink: 0,
  },
  valueRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bar: {
    width: '100%',
    overflow: 'hidden',
    paddingTop: 8,
    paddingBottom: 0,
    paddingLeft: 10,
    paddingRight: 0,
    gap: 8,
  },
  expandedPanel: {
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.6),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    borderRadius: 12,
    paddingTop: 0,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 0,
    marginLeft: -10,
    gap: 8,
  },
  row: {
    width: '100%',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  toggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
  },
  expandedToggle: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

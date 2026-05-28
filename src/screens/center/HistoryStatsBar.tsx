import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  BatteryChargingIcon,
  BatteryMediumIcon,
  ClockCountdownIcon,
  GaugeIcon,
  LightningIcon,
  RepeatIcon,
  RoadHorizonIcon,
  ThermometerHotIcon,
  ThermometerSimpleIcon,
} from 'phosphor-react-native'
import type { Icon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { HistorySession } from '@/store/historyStore'
import { theme } from '@/constants/theme'

interface HistoryStatsBarProps {
  session: HistorySession
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
  const stats = useMemo(() => sessionToStats(session), [session])

  return (
    <View style={[styles.wrap, { top: Math.max(insets.top, 8) + 46 }]} pointerEvents="box-none">
      <View style={styles.grid}>
        {stats.map((item) => (
          <CompactStat key={item.key} item={item} />
        ))}
      </View>
    </View>
  )
}

interface CompactStatProps {
  item: StatItem
}

function CompactStat({ item }: CompactStatProps) {
  const IconComponent = item.icon
  return (
    <View style={styles.compactCell}>
      <IconComponent size={14} color={item.accent} weight="duotone" />
      <Text style={styles.compactValue} numberOfLines={1} adjustsFontSizeToFit>
        {item.value}
      </Text>
      <Text style={styles.compactLabel} numberOfLines={1}>
        {item.label}
      </Text>
    </View>
  )
}

function sessionToStats(session: HistorySession): StatItem[] {
  return [
    {
      key: 'rideTime',
      label: 'Time',
      value: formatDuration(session.endAtMs - session.startAtMs),
      icon: ClockCountdownIcon,
      accent: theme.target.color,
    },
    {
      key: 'topSpeed',
      label: 'Top speed',
      value: formatSpeed(session.maxSpeedKmh),
      icon: GaugeIcon,
      accent: theme.warning.color,
    },
    {
      key: 'mosfetTemp',
      label: 'Ctrl max',
      value: formatTemp(session.maxTempMosfet),
      icon: ThermometerHotIcon,
      accent: theme.error.color,
    },
    {
      key: 'batteryUsed',
      label: 'Used',
      value: formatWh(session.batteryUsedWh),
      icon: BatteryMediumIcon,
      accent: theme.warning.color,
    },
    {
      key: 'maxDuty',
      label: 'Max duty',
      value: formatDuty(session.maxDuty),
      icon: LightningIcon,
      accent: theme.bran.color,
    },
    {
      key: 'distance',
      label: 'Distance',
      value: formatDistance(session.distanceM),
      icon: RoadHorizonIcon,
      accent: theme.wheel.color,
    },
    {
      key: 'avgSpeed',
      label: 'Avg speed',
      value: formatSpeed(session.avgSpeedKmh),
      icon: RepeatIcon,
      accent: theme.teal.color,
    },
    {
      key: 'motorTemp',
      label: 'Motor max',
      value: formatTemp(session.maxTempMotor),
      icon: ThermometerSimpleIcon,
      accent: theme.highlight.color,
    },
    {
      key: 'batteryRegen',
      label: 'Regen',
      value: formatWh(session.batteryRegenWh),
      icon: BatteryChargingIcon,
      accent: theme.gps.color,
    },
  ]
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
  if (value < 1) return `${Math.round(value * 1000)} mWh`
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
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  compactLabel: {
    color: theme.neutral.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    rowGap: 12,
  },
  compactCell: {
    width: '20%',
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 4,
  },
})

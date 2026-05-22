import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ClockCountdownIcon, GaugeIcon, RepeatIcon, RoadHorizonIcon } from 'phosphor-react-native'
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
      <View style={styles.compactRow}>
        {stats.map((item) => (
          <CompactStat key={item.key} item={item} />
        ))}
      </View>
    </View>
  )
}

function CompactStat({ item }: { item: StatItem }) {
  const IconComponent = item.icon
  return (
    <View style={styles.compactCell}>
      <IconComponent size={13} color={item.accent} weight="duotone" />
      <View style={styles.compactText}>
        <Text style={styles.compactValue} numberOfLines={1} adjustsFontSizeToFit>
          {item.value}
        </Text>
        <Text style={styles.compactLabel} numberOfLines={1}>
          {item.label}
        </Text>
      </View>
    </View>
  )
}

function sessionToStats(session: HistorySession): StatItem[] {
  return [
    {
      key: 'distance',
      label: 'Distance',
      value: formatDistance(session.distanceM),
      icon: RoadHorizonIcon,
      accent: theme.wheel.color,
    },
    {
      key: 'rideTime',
      label: 'Ride time',
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
      key: 'avgSpeed',
      label: 'Avg speed',
      value: formatSpeed(session.avgSpeedKmh),
      icon: RepeatIcon,
      accent: '#14b8a6',
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

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 24,
    alignItems: 'center',
  },
  compactRow: {
    width: '100%',
    maxWidth: 420,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  compactCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  compactText: {
    flex: 1,
    minWidth: 0,
  },
  compactValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  compactLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
  },
})

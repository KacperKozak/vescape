import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BatteryChargingVerticalIcon,
  BatteryPlusVerticalIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockCountdownIcon,
  GaugeIcon,
  PathIcon,
  RepeatIcon,
  RoadHorizonIcon,
  TrophyIcon,
} from 'phosphor-react-native'
import type { Icon } from 'phosphor-react-native'
import {
  getMonthlyProfileStats,
  getProfileStatMonths,
  getTotalProfileStats,
  type ProfileStats,
  type ProfileStatsMonth,
} from 'vesc-ble'

import {
  formatDistance,
  formatDuration,
  formatEnergy,
  formatMonthLabel,
  formatSpeed,
  getAdjacentMonths,
  selectInitialMonth,
} from '@/profile/profileStats'

const EMPTY_STATS: ProfileStats = {
  distanceM: null,
  rideCount: 0,
  rideTimeMs: 0,
  topSpeedKmh: 0,
  avgSpeedKmh: 0,
  longestRideM: null,
  batteryUsedWh: null,
  batteryRegenWh: null,
}

interface StatItem {
  key: string
  label: string
  value: string
  icon: Icon
  accent: string
}

export default function ProfileScreen() {
  const [totalStats, setTotalStats] = useState<ProfileStats>(EMPTY_STATS)
  const [monthlyStats, setMonthlyStats] = useState<ProfileStats>(EMPTY_STATS)
  const [months, setMonths] = useState<ProfileStatsMonth[]>([])
  const [selectedMonth, setSelectedMonth] = useState<ProfileStatsMonth>(selectInitialMonth([]))
  const [loading, setLoading] = useState(true)
  const [monthLoading, setMonthLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [total, availableMonths] = await Promise.all([
        getTotalProfileStats(),
        getProfileStatMonths(),
      ])
      const initialMonth = selectInitialMonth(availableMonths)
      const monthStats = await getMonthlyProfileStats(initialMonth)
      setTotalStats(total)
      setMonths(availableMonths)
      setSelectedMonth(initialMonth)
      setMonthlyStats(monthStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  const loadMonth = useCallback(async (month: ProfileStatsMonth) => {
    setSelectedMonth(month)
    setMonthLoading(true)
    setError(null)
    try {
      const stats = await getMonthlyProfileStats(month)
      setMonthlyStats(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMonthLoading(false)
    }
  }, [])

  const totalItems = useMemo(() => statsToCards(totalStats), [totalStats])
  const monthItems = useMemo(() => statsToCards(monthlyStats), [monthlyStats])
  const adjacent = useMemo(() => getAdjacentMonths(months, selectedMonth), [months, selectedMonth])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>All time</Text>
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Total distance</Text>
          <Text style={styles.heroValue}>{formatDistance(totalStats.distanceM)}</Text>
        </View>
        <StatsGrid items={totalItems} />

        <View style={styles.monthHeader}>
          <Text style={styles.sectionTitle}>Calendar month</Text>
          {monthLoading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
        </View>
        <View style={styles.monthNav}>
          <Pressable
            style={[styles.navButton, !adjacent.previous && styles.navDisabled]}
            onPress={() => adjacent.previous && void loadMonth(adjacent.previous)}
            disabled={!adjacent.previous}
          >
            <CaretLeftIcon size={18} color="#f8fafc" weight="bold" />
          </Pressable>
          <Pressable style={styles.monthPicker} onPress={() => setPickerOpen(true)}>
            <Text style={styles.monthPickerText}>{formatMonthLabel(selectedMonth)}</Text>
            <CaretDownIcon size={16} color="#94a3b8" weight="bold" />
          </Pressable>
          <Pressable
            style={[styles.navButton, !adjacent.next && styles.navDisabled]}
            onPress={() => adjacent.next && void loadMonth(adjacent.next)}
            disabled={!adjacent.next}
          >
            <CaretRightIcon size={18} color="#f8fafc" weight="bold" />
          </Pressable>
        </View>
        <StatsGrid items={monthItems} />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#60a5fa" />
          </View>
        ) : null}

        {error ? (
          <Pressable style={styles.errorCard} onPress={() => void loadInitial()}>
            <Text style={styles.errorTitle}>Could not load profile stats</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            {(months.length ? months : [selectedMonth]).map((month) => (
              <Pressable
                key={`${month.year}-${month.month}`}
                style={styles.modalRow}
                onPress={() => {
                  setPickerOpen(false)
                  void loadMonth(month)
                }}
              >
                <Text style={styles.modalRowText}>{formatMonthLabel(month)}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function statsToCards(stats: ProfileStats): StatItem[] {
  return [
    {
      key: 'distance',
      label: 'Distance',
      value: formatDistance(stats.distanceM),
      icon: RoadHorizonIcon,
      accent: '#38bdf8',
    },
    {
      key: 'rides',
      label: 'Rides',
      value: String(stats.rideCount),
      icon: PathIcon,
      accent: '#22d3ee',
    },
    {
      key: 'rideTime',
      label: 'Ride time',
      value: formatDuration(stats.rideTimeMs),
      icon: ClockCountdownIcon,
      accent: '#a78bfa',
    },
    {
      key: 'topSpeed',
      label: 'Top speed',
      value: formatSpeed(stats.topSpeedKmh),
      icon: GaugeIcon,
      accent: '#f97316',
    },
    {
      key: 'avgSpeed',
      label: 'Avg speed',
      value: formatSpeed(stats.avgSpeedKmh),
      icon: RepeatIcon,
      accent: '#14b8a6',
    },
    {
      key: 'longestRide',
      label: 'Longest ride',
      value: formatDistance(stats.longestRideM),
      icon: TrophyIcon,
      accent: '#facc15',
    },
    {
      key: 'used',
      label: 'Battery used',
      value: formatEnergy(stats.batteryUsedWh),
      icon: BatteryChargingVerticalIcon,
      accent: '#60a5fa',
    },
    {
      key: 'regen',
      label: 'Regen',
      value: formatEnergy(stats.batteryRegenWh),
      icon: BatteryPlusVerticalIcon,
      accent: '#4ade80',
    },
  ]
}

function StatsGrid({ items }: { items: StatItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const IconComponent = item.icon
        return (
          <View key={item.key} style={styles.statCard}>
            <View style={[styles.iconWrap, { borderColor: item.accent }]}>
              <IconComponent size={15} color={item.accent} weight="duotone" />
            </View>
            <Text style={styles.statLabel}>{item.label}</Text>
            <Text style={styles.statValue}>{item.value}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  heroCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  heroLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  heroValue: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    minHeight: 96,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    gap: 6,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    color: '#f1f5f9',
    fontSize: 17,
    fontWeight: '800',
  },
  monthHeader: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: {
    opacity: 0.4,
  },
  monthPicker: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthPickerText: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingWrap: {
    padding: 18,
    alignItems: 'center',
  },
  errorCard: {
    backgroundColor: '#7f1d1d',
    borderColor: '#991b1b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  errorTitle: {
    color: '#fee2e2',
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 12,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalSheet: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  modalRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalRowText: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
})

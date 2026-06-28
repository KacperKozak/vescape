import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/ui/base/Button'
import type { RosterRider } from '@/lib/groupRide/roster'
import { useGroupRideStore } from '@/store/groupRideStore'
import { theme } from '@/constants/theme'

export function RiderRosterSection() {
  const activeRideId = useGroupRideStore((s) => s.activeRideId)
  const rides = useGroupRideStore((s) => s.rides)
  const rows = useGroupRideStore((s) => s.rosterRows)
  const leaveRide = useGroupRideStore((s) => s.leaveRide)
  const focusRider = useGroupRideStore((s) => s.focusRider)
  const error = useGroupRideStore((s) => s.error)
  const clearError = useGroupRideStore((s) => s.clearError)
  const activeRide = activeRideId ? rides.find((ride) => ride.id === activeRideId) : null

  const focus = (rider: RosterRider) => {
    if (!rider.presence) return
    focusRider(rider.id)
    router.back()
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Riders</Text>
        {activeRideId && (
          <Button label="Leave" size="sm" variant="destructive" onPress={leaveRide} />
        )}
      </View>

      {error && (
        <Pressable accessibilityRole="button" onPress={clearError} style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      )}

      {!activeRideId ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Join a group ride to see everyone riding with you.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.activeRideName} numberOfLines={1}>
            {activeRide?.name ?? 'Joined group ride'}
          </Text>
          {rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No other riders in this group ride yet.</Text>
            </View>
          ) : (
            rows.map((rider) => (
              <RiderRow key={rider.id} rider={rider} onPress={() => focus(rider)} />
            ))
          )}
        </View>
      )}
    </View>
  )
}

function RiderRow({ rider, onPress }: { rider: RosterRider; onPress: () => void }) {
  const presence = rider.presence
  const disabled = !presence

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        rider.stale && styles.rowStale,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      <View
        style={[
          styles.riderDot,
          { borderColor: rider.stale ? theme.palette.slate.textMuted : theme.palette.cyan.color },
        ]}
      />
      <View style={styles.rowText}>
        <Text style={styles.riderName} numberOfLines={1}>
          {rider.name || 'Rider'}
        </Text>
        <Text style={styles.riderMeta} numberOfLines={1}>
          {formatDistance(rider.distanceM)} · {formatSpeed(presence?.speed)} ·{' '}
          {formatSoc(presence?.soc)}
        </Text>
      </View>
      {rider.stale && <Text style={styles.stale}>Stale</Text>}
    </Pressable>
  )
}

function formatDistance(meters: number | null): string {
  if (meters == null) return 'distance --'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function formatSpeed(speedMps: number | null | undefined): string {
  if (speedMps == null) return 'speed --'
  return `${Math.round(speedMps * 3.6)} km/h`
}

function formatSoc(soc: number | null | undefined): string {
  if (soc == null) return 'SoC --'
  return `${Math.round(soc * 100)}%`
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  headerRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  list: {
    gap: 8,
  },
  activeRideName: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.78,
  },
  rowStale: {
    opacity: 0.62,
  },
  riderDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    backgroundColor: theme.palette.slate.textPrimary,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  riderName: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  riderMeta: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
  },
  stale: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyCard: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorCard: {
    backgroundColor: theme.status.error.bg,
    borderColor: theme.status.error.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: theme.status.error.text,
    fontSize: 13,
    lineHeight: 18,
  },
})

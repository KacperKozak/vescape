import { StyleSheet, Text, View } from 'react-native'
import { BroadcastIcon, ChartLineUpIcon } from 'phosphor-react-native'
import { router } from 'expo-router'

import { Button } from '@/components/ui/base/Button'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { CanvasWidget } from '@/components/widgets/CanvasWidget'
import { InputWidget } from '@/components/widgets/InputWidget'
import { LinkWidget } from '@/components/widgets/LinkWidget'
import { routes } from '@/navigation/routes'
import { useGroupRideStore } from '@/store/groupRideStore'
import { useRiderStore } from '@/store/riderStore'
import { theme } from '@/constants/theme'

interface SocialSheetProps {
  /** Called before navigating away so the host can dismiss the sheet. */
  onNavigate: () => void
}

export function SocialSheet({ onNavigate }: SocialSheetProps) {
  return (
    <View style={styles.list}>
      <RiderNameWidget />
      <GroupRideWidget />
      <LinkWidget
        icon={ChartLineUpIcon}
        accent={theme.palette.sky.color}
        label="Profile stats"
        hint="All-time & monthly riding totals"
        onPress={() => {
          onNavigate()
          router.push(routes.profile)
        }}
      />
    </View>
  )
}

function RiderNameWidget() {
  const riderName = useRiderStore((s) => s.riderName)
  const setName = useRiderStore((s) => s.setName)

  return (
    <InputWidget
      label="Your name"
      value={riderName}
      placeholder="Add a display name"
      maxLength={32}
      onCommit={(value) => void setName(value)}
      accessibilityLabel="Rider display name"
    />
  )
}

function GroupRideWidget() {
  const activeRideId = useGroupRideStore((s) => s.activeRideId)
  const rides = useGroupRideStore((s) => s.rides)
  const nearby = useGroupRideStore((s) => s.nearby)
  const rosterRows = useGroupRideStore((s) => s.rosterRows)
  const hasLocation = useGroupRideStore((s) => s.ownLocation !== null)
  const createRide = useGroupRideStore((s) => s.createRide)
  const leaveRide = useGroupRideStore((s) => s.leaveRide)
  const joinRide = useGroupRideStore((s) => s.joinRide)

  const activeRide = rides.find((r) => r.id === activeRideId)
  const riderCount = rosterRows.length || activeRide?.riderCount || 0
  const active = activeRideId != null
  const accent = theme.palette.groupRide.color

  const footer = active ? (
    <Button
      label="Stop"
      variant="secondary"
      onPress={leaveRide}
      style={styles.fill}
      accessibilityLabel="Stop group ride"
    />
  ) : nearby.length > 0 ? (
    <Button
      label="Join"
      onPress={() => joinRide(nearby[0].ride.id)}
      style={[styles.fill, styles.actionBtn]}
      accessibilityLabel="Join nearest group ride"
    />
  ) : (
    <Button
      label="Create"
      onPress={() => createRide('')}
      disabled={!hasLocation}
      style={[styles.fill, styles.actionBtn]}
      accessibilityLabel="Create group ride"
    />
  )

  return (
    <CanvasWidget
      icon={BroadcastIcon}
      title="Group Ride"
      accent={accent}
      active={active}
      height={240}
      footer={footer}
    >
      {active ? (
        <>
          <Text style={styles.rideName} numberOfLines={1}>
            {activeRide?.name?.trim() || 'Your group ride'}
          </Text>
          <Text style={styles.rideMeta}>
            {riderCount} {riderCount === 1 ? 'rider' : 'riders'} · live now
          </Text>
        </>
      ) : nearby.length > 0 ? (
        <Text style={styles.rideMeta}>
          {nearby.length} {nearby.length === 1 ? 'ride' : 'rides'} near you.
        </Text>
      ) : (
        <Placeholder icon={BroadcastIcon} description="No group rides near you right now." />
      )}
    </CanvasWidget>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  fill: {
    flex: 1,
  },
  actionBtn: {
    backgroundColor: theme.palette.groupRide.border,
  },
  rideName: {
    color: theme.palette.slate.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  rideMeta: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
  },
})

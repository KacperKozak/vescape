import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  BroadcastIcon,
  ChartLineUpIcon,
  CrosshairIcon,
  DeviceMobileIcon,
  GaugeIcon,
  BatteryMediumIcon,
  PaletteIcon,
  ThermometerSimpleIcon,
  UsersIcon,
  XIcon,
  type Icon,
} from 'phosphor-react-native'
import { router } from 'expo-router'

import { Button } from '@/components/ui/base/Button'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { ColorPicker } from '@/components/ui/forms/ColorPicker'
import { CanvasWidget } from '@/components/widgets/CanvasWidget'
import { InputWidget } from '@/components/widgets/InputWidget'
import { LinkWidget } from '@/components/widgets/LinkWidget'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { riderColorOptions } from '@/constants/riderColors'
import { DASH, fmtDistance, fmtPercent, fmtSince, fmtSpeedKmh, fmtTempC } from '@/helpers/format'
import type { NearbyRide } from '@/lib/groupRide/nearby'
import type { RosterRider } from '@/lib/groupRide/roster'
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
  const riderColor = useRiderStore((s) => s.riderColor)
  const setColor = useRiderStore((s) => s.setColor)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <View style={styles.nameGroup}>
      <InputWidget
        label="Your name"
        value={riderName}
        placeholder="Add a display name"
        maxLength={32}
        onCommit={(value) => void setName(value)}
        accessibilityLabel="Rider display name"
        accessory={
          <Pressable
            onPress={() => setPickerOpen((open) => !open)}
            hitSlop={8}
            accessibilityLabel="Pick your color"
            style={[
              styles.colorDot,
              riderColor ? { backgroundColor: riderColor } : styles.colorDotEmpty,
              pickerOpen && styles.colorDotActive,
            ]}
          >
            {riderColor ? null : (
              <PaletteIcon size={16} color={theme.palette.slate.textSecondary} weight="bold" />
            )}
          </Pressable>
        }
      />
      {pickerOpen ? (
        <View style={styles.pickerPanel}>
          <ColorPicker
            value={riderColor}
            colors={riderColorOptions}
            onChange={(color) => void setColor(color)}
          />
        </View>
      ) : null}
    </View>
  )
}

function GroupRideWidget() {
  const activeRideId = useGroupRideStore((s) => s.activeRideId)
  const rides = useGroupRideStore((s) => s.rides)
  const nearby = useGroupRideStore((s) => s.nearby)
  const rosterRows = useGroupRideStore((s) => s.rosterRows)
  const connection = useGroupRideStore((s) => s.connection)
  const hasLocation = useGroupRideStore((s) => s.ownLocation !== null)
  const createRide = useGroupRideStore((s) => s.createRide)
  const leaveRide = useGroupRideStore((s) => s.leaveRide)
  const joinRide = useGroupRideStore((s) => s.joinRide)

  const [nearbyDismissed, setNearbyDismissed] = useState(false)

  const activeRide = rides.find((r) => r.id === activeRideId)
  const active = activeRideId != null
  const showNearby = !active && nearby.length > 0 && !nearbyDismissed
  const accent = theme.palette.groupRide.color
  const rideName = activeRide?.name?.trim() || 'Your group ride'

  const footer = active ? (
    <Button
      label="Leave"
      variant="secondary"
      onPress={leaveRide}
      style={styles.fill}
      accessibilityLabel="Leave group ride"
    />
  ) : showNearby ? (
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

  const action = active ? (
    <LiveBadge connected={connection === 'connected'} />
  ) : showNearby ? (
    <Pressable
      onPress={() => setNearbyDismissed(true)}
      hitSlop={10}
      accessibilityLabel="Dismiss nearby rides"
    >
      <XIcon size={18} color={theme.palette.slate.textSecondary} weight="bold" />
    </Pressable>
  ) : null

  return (
    <CanvasWidget
      icon={BroadcastIcon}
      title={active ? rideName : 'Group Ride'}
      accent={accent}
      active={active}
      height={active && rosterRows.length > 0 ? undefined : 240}
      footer={footer}
      action={action}
    >
      {active ? (
        rosterRows.length > 0 ? (
          <RosterGrid rows={rosterRows} accent={accent} connected={connection === 'connected'} />
        ) : (
          <Placeholder icon={UsersIcon} description="Waiting for other riders to join." />
        )
      ) : showNearby ? (
        <NearbyRideBody nearby={nearby} />
      ) : !hasLocation ? (
        <Placeholder icon={CrosshairIcon} description="Finding your location…" />
      ) : (
        <Placeholder icon={BroadcastIcon} description="No group rides near you right now." />
      )}
    </CanvasWidget>
  )
}

/** Connection-state pill in the header: green "LIVE" when the relay socket is up, amber
 *  "OFFLINE" when presence can't reach the server (e.g. no internet). */
function LiveBadge({ connected }: { connected: boolean }) {
  const tone = connected ? theme.palette.groupRide : theme.palette.amber
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={[styles.badgeDot, { backgroundColor: tone.color }]} />
      <Text style={[styles.badgeLabel, { color: tone.light }]}>
        {connected ? 'LIVE' : 'OFFLINE'}
      </Text>
    </View>
  )
}

/** Three-column roster of the riders in the active ride. */
function RosterGrid({
  rows,
  accent,
  connected,
}: {
  rows: RosterRider[]
  accent: string
  connected: boolean
}) {
  return (
    <View style={styles.grid}>
      {rows.map((rider) => (
        <RiderCell key={rider.id} rider={rider} accent={accent} connected={connected} />
      ))}
    </View>
  )
}

interface RiderStats {
  speed?: string
  soc?: string
  motor?: string
  ctrl?: string
  phone?: string
}

/** Format the per-Rider telemetry values shown in the roster stat grid. */
function riderStats(p: RosterRider['presence']): RiderStats {
  if (!p) return {}
  return {
    speed: p.speed != null ? fmtSpeedKmh(p.speed) : undefined,
    soc: p.soc != null ? fmtPercent(p.soc) : undefined,
    motor: p.motorTemp != null ? `M ${fmtTempC(p.motorTemp)}` : undefined,
    ctrl: p.ctrlTemp != null ? `C ${fmtTempC(p.ctrlTemp)}` : undefined,
    phone: p.phoneBattery != null ? fmtPercent(p.phoneBattery) : undefined,
  }
}

/** One fixed column of the stat grid: its icon is always shown; a missing value reads as a dash. */
function StatCell({ icon: StatIcon, value }: { icon: Icon; value?: string }) {
  return (
    <View style={styles.statCell}>
      <View style={styles.statIconSlot}>
        <StatIcon size={11} color={theme.palette.slate.textSecondary} weight="bold" />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value ?? DASH}
      </Text>
    </View>
  )
}

function RiderCell({
  rider,
  accent,
  connected,
}: {
  rider: RosterRider
  accent: string
  connected: boolean
}) {
  const dotColor = rider.color || theme.palette.slate.textMuted
  const boardName = rider.presence?.boardName?.trim() || 'No board'
  // Only claim a rider is "Live" when our own relay link is up — otherwise the roster is just
  // the last snapshot we received and we can't know it's current.
  const fresh = !rider.stale && connected
  const statusColor = fresh ? accent : theme.palette.slate.textMuted
  const status = fresh ? 'Live' : fmtSince(rider.lastSeen)
  const s = riderStats(rider.presence)

  return (
    <View style={styles.riderCell}>
      <View style={styles.riderHead}>
        <View style={[styles.riderDot, { backgroundColor: dotColor }]} />
        <Text style={styles.riderName} numberOfLines={1}>
          {rider.name}
        </Text>
        {rider.isSelf ? <Text style={styles.selfTag}>You</Text> : null}
      </View>
      <Text style={styles.riderBoard} numberOfLines={1}>
        {boardName}
      </Text>
      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <View style={styles.statIconSlot}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            </View>
            <Text style={[styles.statValue, { color: statusColor }]} numberOfLines={1}>
              {status}
            </Text>
          </View>
          <StatCell icon={DeviceMobileIcon} value={s.phone} />
        </View>
        <View style={styles.statRow}>
          <StatCell icon={GaugeIcon} value={s.speed} />
          <StatCell icon={ThermometerSimpleIcon} value={s.motor} />
        </View>
        <View style={styles.statRow}>
          <StatCell icon={BatteryMediumIcon} value={s.soc} />
          <StatCell icon={ThermometerSimpleIcon} value={s.ctrl} />
        </View>
      </View>
    </View>
  )
}

function NearbyRideBody({ nearby }: { nearby: NearbyRide[] }) {
  const nearest = nearby[0]
  const ride = nearest.ride
  const name = ride.name?.trim() || `${ride.creator.name || 'Rider'}'s ride`
  const extra = nearby.length - 1

  return (
    <>
      <Text style={styles.rideName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.rideMeta} numberOfLines={1}>
        {ride.riderCount} {ride.riderCount === 1 ? 'rider' : 'riders'} ·{' '}
        {fmtDistance(nearest.distanceM)} away
      </Text>
      {extra > 0 ? (
        <Text style={styles.rideMetaDim}>
          +{extra} more {extra === 1 ? 'ride' : 'rides'} nearby
        </Text>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  nameGroup: {
    gap: 8,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
  },
  colorDotEmpty: {
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  colorDotActive: {
    borderColor: theme.palette.slate.textPrimary,
  },
  pickerPanel: {
    ...widgetSurface,
    padding: 16,
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
  rideMetaDim: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    opacity: 0.7,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  riderCell: {
    // Fixed 3-up grid: a lone rider stays one column wide instead of stretching full width.
    width: '31%',
    gap: 2,
  },
  riderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  riderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  riderName: {
    flexShrink: 1,
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  selfTag: {
    color: theme.palette.groupRide.light,
    backgroundColor: theme.palette.groupRide.bg,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    overflow: 'hidden',
  },
  riderBoard: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
  },
  statGrid: {
    gap: 2,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statCell: {
    flex: 1,
    // Ignore content min-width so both columns split the row exactly 50/50 and stay aligned
    // down the grid; overflowing values ellipsize instead of pushing the column right.
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Fixed-width glyph slot so every value's text starts at the same x regardless of the
  // icon's (or status dot's) intrinsic width.
  statIconSlot: {
    width: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statValue: {
    flexShrink: 1,
    color: theme.palette.slate.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
})

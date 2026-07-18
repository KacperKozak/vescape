import { theme } from '@/constants/theme'
import type { RosterRider } from '@/modules/group-ride/lib/roster'

/** Fallback tints assigned by roster index when a Rider has not picked a color. */
const RIDER_FALLBACK_COLORS = [
  theme.palette.cyan.color,
  theme.palette.green.color,
  theme.palette.amber.color,
  theme.palette.fuchsia.color,
  theme.palette.sky.color,
]

/** Marker/trail tint for a Rider: their chosen color, a palette fallback, or muted when stale. */
export function rosterRiderColor(rider: RosterRider, index: number): string {
  return rider.stale
    ? theme.palette.slate.textMuted
    : (rider.color ?? RIDER_FALLBACK_COLORS[index % RIDER_FALLBACK_COLORS.length])
}

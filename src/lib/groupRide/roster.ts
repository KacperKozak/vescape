import type { GroupRideRider } from 'vesc-ble'

import { distanceMeters } from '@/helpers/mapGeometry'

export interface RosterRider extends GroupRideRider {
  distanceM: number | null
}

export const RIDER_STALE_AFTER_MS = 5_000
export const RIDER_DROP_AFTER_MS = 30_000

export function clientFreshRoster(riders: GroupRideRider[], nowMs: number): GroupRideRider[] {
  return riders
    .filter((rider) => nowMs - rider.lastSeen < RIDER_DROP_AFTER_MS)
    .map((rider) => ({
      ...rider,
      stale: rider.stale || nowMs - rider.lastSeen >= RIDER_STALE_AFTER_MS,
    }))
}

export function riderRoster(
  riders: GroupRideRider[],
  ownRiderId: string | null,
  ownLocation: { lat: number; lng: number } | null,
  nowMs = Date.now(),
): RosterRider[] {
  const from = ownLocation ? { latitude: ownLocation.lat, longitude: ownLocation.lng } : null

  return clientFreshRoster(riders, nowMs)
    .filter((rider) => rider.id !== ownRiderId)
    .map((rider) => ({
      ...rider,
      distanceM:
        from && rider.presence
          ? distanceMeters(from, {
              latitude: rider.presence.lat,
              longitude: rider.presence.lng,
            })
          : null,
    }))
    .sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? 1 : -1
      if (a.distanceM == null && b.distanceM == null) return a.name.localeCompare(b.name)
      if (a.distanceM == null) return 1
      if (b.distanceM == null) return -1
      return a.distanceM - b.distanceM
    })
}

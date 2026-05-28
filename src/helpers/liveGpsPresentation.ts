import type { LocationEvent } from 'vesc-ble'

import { distanceMeters } from './mapGeometry'

const LIVE_GPS_DEGRADED_GRACE_MS = 2_000
const LIVE_GPS_BEARING_STALE_MS = 10_000
const LIVE_GPS_BEARING_MIN_SPEED_MPS = 0.8
const LIVE_GPS_BEARING_MIN_DISTANCE_M = 2

interface LiveGpsPresentationArgs {
  preciseFix: LocationEvent | null
  previousPreciseFix?: LocationEvent | null
  latestApproximateFix: LocationEvent | null
  initialApproximateFix: LocationEvent | null
  previousReliableBearing?: ReliableGpsBearing | null
  degradedGraceMs?: number
  bearingStaleMs?: number
}

export interface LiveGpsPresentation {
  cameraFix: LocationEvent | null
  accuracyFix: LocationEvent | null
  accuracyRadiusM: number | null
  directionBearingDeg: number | null
  nextReliableBearing: ReliableGpsBearing | null
  nextInitialApproximateFix: LocationEvent | null
  degraded: boolean
}

export interface ReliableGpsBearing {
  bearingDeg: number
  sourceTimestamp: number
}

export function getReliableGpsBearingFromFixes(
  fixes: LocationEvent[],
  bearingStaleMs = LIVE_GPS_BEARING_STALE_MS,
): ReliableGpsBearing | null {
  let reliableBearing: ReliableGpsBearing | null = null
  for (let i = 0; i < fixes.length; i += 1) {
    reliableBearing = getReliableGpsBearing({
      preciseFix: fixes[i],
      previousPreciseFix: fixes[i - 1] ?? null,
      previousReliableBearing: reliableBearing,
      bearingStaleMs,
    })
  }
  return reliableBearing
}

export function getLiveGpsPresentation({
  preciseFix,
  previousPreciseFix = null,
  latestApproximateFix,
  initialApproximateFix,
  previousReliableBearing = null,
  degradedGraceMs = LIVE_GPS_DEGRADED_GRACE_MS,
  bearingStaleMs = LIVE_GPS_BEARING_STALE_MS,
}: LiveGpsPresentationArgs): LiveGpsPresentation {
  const nextInitialApproximateFix = getNextInitialApproximateFix({
    preciseFix,
    latestApproximateFix,
    initialApproximateFix,
  })
  const degradedAccuracyRadiusM = getDegradedAccuracyRadiusM({
    preciseFix,
    latestApproximateFix,
    degradedGraceMs,
  })
  const cameraFix = preciseFix ?? nextInitialApproximateFix
  const accuracyFix = degradedAccuracyRadiusM != null ? preciseFix : cameraFix
  const nextReliableBearing = getReliableGpsBearing({
    preciseFix,
    previousPreciseFix,
    previousReliableBearing,
    bearingStaleMs,
  })

  return {
    cameraFix,
    accuracyFix,
    accuracyRadiusM: degradedAccuracyRadiusM ?? accuracyFix?.accuracyM ?? null,
    directionBearingDeg: nextReliableBearing?.bearingDeg ?? null,
    nextReliableBearing,
    nextInitialApproximateFix,
    degraded: degradedAccuracyRadiusM != null,
  }
}

function getNextInitialApproximateFix({
  preciseFix,
  latestApproximateFix,
  initialApproximateFix,
}: Pick<
  LiveGpsPresentationArgs,
  'preciseFix' | 'latestApproximateFix' | 'initialApproximateFix'
>): LocationEvent | null {
  if (preciseFix || !latestApproximateFix) return null
  return initialApproximateFix ?? latestApproximateFix
}

function getDegradedAccuracyRadiusM({
  preciseFix,
  latestApproximateFix,
  degradedGraceMs,
}: Pick<LiveGpsPresentationArgs, 'preciseFix' | 'latestApproximateFix'> & {
  degradedGraceMs: number
}): number | null {
  if (!preciseFix || !latestApproximateFix || latestApproximateFix.precise) return null
  if (latestApproximateFix.timestamp - preciseFix.timestamp <= degradedGraceMs) return null

  return distanceMeters(preciseFix, latestApproximateFix) + (latestApproximateFix.accuracyM ?? 0)
}

function getReliableGpsBearing({
  preciseFix,
  previousPreciseFix,
  previousReliableBearing,
  bearingStaleMs,
}: {
  preciseFix: LocationEvent | null
  previousPreciseFix: LocationEvent | null
  previousReliableBearing: ReliableGpsBearing | null
  bearingStaleMs: number
}): ReliableGpsBearing | null {
  if (!preciseFix) return null

  const speedMps = preciseFix.speedMps
  const moving = speedMps == null || speedMps >= LIVE_GPS_BEARING_MIN_SPEED_MPS
  if (moving) {
    const bearingDeg = normalizeBearingDeg(preciseFix.bearingDeg)
    if (bearingDeg != null) {
      return { bearingDeg, sourceTimestamp: preciseFix.timestamp }
    }

    const derivedBearingDeg = deriveTravelBearingDeg(previousPreciseFix, preciseFix)
    if (derivedBearingDeg != null) {
      return { bearingDeg: derivedBearingDeg, sourceTimestamp: preciseFix.timestamp }
    }
  }

  if (
    previousReliableBearing &&
    preciseFix.timestamp - previousReliableBearing.sourceTimestamp <= bearingStaleMs
  ) {
    return previousReliableBearing
  }

  return null
}

function normalizeBearingDeg(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return ((value % 360) + 360) % 360
}

function deriveTravelBearingDeg(
  previousPreciseFix: LocationEvent | null,
  preciseFix: LocationEvent,
): number | null {
  if (!previousPreciseFix || previousPreciseFix.timestamp >= preciseFix.timestamp) return null
  if (distanceMeters(previousPreciseFix, preciseFix) < LIVE_GPS_BEARING_MIN_DISTANCE_M) return null

  const lat1 = (previousPreciseFix.latitude * Math.PI) / 180
  const lat2 = (preciseFix.latitude * Math.PI) / 180
  const deltaLon = ((preciseFix.longitude - previousPreciseFix.longitude) * Math.PI) / 180
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)

  return normalizeBearingDeg((Math.atan2(y, x) * 180) / Math.PI)
}

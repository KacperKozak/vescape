import { describe, expect, test } from 'bun:test'
import type { HistorySession } from '@/store/historyStore'

import {
  canShowBaseOverlays,
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from './centerState'

const sessions = [session('newest', 3000), session('middle', 2000), session('oldest', 1000)]

function session(id: string, startAtMs: number): HistorySession {
  return {
    id,
    deviceId: 'dev-1',
    deviceName: 'ADV',
    startAtMs,
    endAtMs: startAtMs + 60_000,
    blockIds: [id],
    blockCount: 1,
    distanceM: 1200,
    maxSpeedKmh: 32,
    avgSpeedKmh: 18,
    sampleCount: 20,
    gpsPointCount: 20,
    preciseGpsPointCount: 18,
    faultCount: 0,
    boundaryBefore: 'none',
  }
}

describe('centerState', () => {
  test('getLatestSession returns first session from store order', () => {
    expect(getLatestSession(sessions)?.id).toBe('newest')
    expect(getLatestSession([])).toBeNull()
  })

  test('getPreviousRideSession moves toward older sessions', () => {
    expect(getPreviousRideSession(sessions, sessions[0])?.id).toBe('middle')
    expect(getPreviousRideSession(sessions, sessions[1])?.id).toBe('oldest')
    expect(getPreviousRideSession(sessions, sessions[2])).toBeNull()
  })

  test('getNextRideSession moves toward newer sessions', () => {
    expect(getNextRideSession(sessions, sessions[2])?.id).toBe('middle')
    expect(getNextRideSession(sessions, sessions[1])?.id).toBe('newest')
    expect(getNextRideSession(sessions, sessions[0])).toBeNull()
  })

  test('base overlays show only when not map focused and not reviewing ride', () => {
    expect(canShowBaseOverlays({ mapFocused: false, hasRide: false })).toBe(true)
    expect(canShowBaseOverlays({ mapFocused: true, hasRide: false })).toBe(false)
    expect(canShowBaseOverlays({ mapFocused: false, hasRide: true })).toBe(false)
  })
})

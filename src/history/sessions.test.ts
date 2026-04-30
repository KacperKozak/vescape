import { expect, test } from 'bun:test'

import type { TelemetryHistoryBlock } from 'vesc-ble'
import { groupHistorySessions } from './sessions'

function block(overrides: Partial<TelemetryHistoryBlock>): TelemetryHistoryBlock {
  const startAtMs = overrides.startAtMs ?? 0
  const endAtMs = overrides.endAtMs ?? startAtMs + 60_000
  return {
    id: overrides.id ?? `b-${startAtMs}`,
    startAtMs,
    endAtMs,
    bucketStartMs: overrides.bucketStartMs ?? startAtMs,
    deviceId: overrides.deviceId ?? 'dev-a',
    deviceName: overrides.deviceName ?? 'Board A',
    sampleCount: overrides.sampleCount ?? 10,
    gpsPointCount: overrides.gpsPointCount ?? 5,
    preciseGpsPointCount: overrides.preciseGpsPointCount ?? 4,
    maxAbsSpeedKmh: overrides.maxAbsSpeedKmh ?? 20,
    maxGpsSpeedKmh: overrides.maxGpsSpeedKmh ?? 18,
    avgAbsSpeedKmh: overrides.avgAbsSpeedKmh ?? 15,
    minBatteryVoltage: overrides.minBatteryVoltage ?? 52,
    maxMotorCurrent: overrides.maxMotorCurrent ?? 10,
    maxBatteryCurrent: overrides.maxBatteryCurrent ?? 8,
    maxDuty: overrides.maxDuty ?? 0.5,
    faultCount: overrides.faultCount ?? 0,
    distanceDeltaM: overrides.distanceDeltaM !== undefined ? overrides.distanceDeltaM : 100,
    gpsDistanceM: overrides.gpsDistanceM !== undefined ? overrides.gpsDistanceM : 120,
    boundaryBefore: overrides.boundaryBefore ?? 'none',
    boundaryMessage: overrides.boundaryMessage ?? null,
    gapBeforeMs: overrides.gapBeforeMs ?? null,
  }
}

test('combines same-device adjacent blocks under 10 min gap', () => {
  const sessions = groupHistorySessions([
    block({ id: 'new', startAtMs: 300_000, endAtMs: 360_000 }),
    block({ id: 'old', startAtMs: 120_000, endAtMs: 180_000 }),
  ])
  expect(sessions).toHaveLength(1)
  expect(sessions[0].blockIds).toEqual(['old', 'new'])
})

test('splits same-device blocks over 10 min gap', () => {
  const sessions = groupHistorySessions([
    block({ id: 'new', startAtMs: 900_000, endAtMs: 960_000 }),
    block({ id: 'old', startAtMs: 120_000, endAtMs: 180_000 }),
  ])
  expect(sessions).toHaveLength(2)
})

test('splits different devices even when adjacent', () => {
  const sessions = groupHistorySessions([
    block({
      id: 'new',
      deviceId: 'dev-b',
      deviceName: 'Board B',
      startAtMs: 240_000,
      endAtMs: 300_000,
    }),
    block({ id: 'old', deviceId: 'dev-a', startAtMs: 120_000, endAtMs: 180_000 }),
  ])
  expect(sessions).toHaveLength(2)
})

test('splits on disconnected, app_stop and error boundaries', () => {
  const sessions = groupHistorySessions([
    block({ id: 'err', startAtMs: 600_000, endAtMs: 660_000, boundaryBefore: 'error' }),
    block({ id: 'stop', startAtMs: 420_000, endAtMs: 480_000, boundaryBefore: 'app_stop' }),
    block({ id: 'disc', startAtMs: 240_000, endAtMs: 300_000, boundaryBefore: 'disconnected' }),
    block({ id: 'base', startAtMs: 120_000, endAtMs: 180_000 }),
  ])
  expect(sessions).toHaveLength(4)
})

test('keeps connected boundary in same grouped ride when gap small', () => {
  const sessions = groupHistorySessions([
    block({ id: 'new', startAtMs: 240_000, endAtMs: 300_000, boundaryBefore: 'connected' }),
    block({ id: 'old', startAtMs: 120_000, endAtMs: 180_000 }),
  ])
  expect(sessions).toHaveLength(1)
})

test('distance prefers distanceDelta sum', () => {
  const sessions = groupHistorySessions([
    block({
      id: 'new',
      startAtMs: 240_000,
      endAtMs: 300_000,
      distanceDeltaM: 200,
      gpsDistanceM: 1,
    }),
    block({
      id: 'old',
      startAtMs: 120_000,
      endAtMs: 180_000,
      distanceDeltaM: 100,
      gpsDistanceM: 1,
    }),
  ])
  expect(sessions[0].distanceM).toBe(300)
})

test('distance falls back to gpsDistance when odometer distance missing', () => {
  const sessions = groupHistorySessions([
    block({
      id: 'new',
      startAtMs: 240_000,
      endAtMs: 300_000,
      distanceDeltaM: null,
      gpsDistanceM: 60,
    }),
    block({
      id: 'old',
      startAtMs: 120_000,
      endAtMs: 180_000,
      distanceDeltaM: null,
      gpsDistanceM: 40,
    }),
  ])
  expect(sessions[0].distanceM).toBe(100)
})

test('max speed uses higher value from board or gps', () => {
  const sessions = groupHistorySessions([
    block({
      id: 'new',
      startAtMs: 240_000,
      endAtMs: 300_000,
      maxAbsSpeedKmh: 20,
      maxGpsSpeedKmh: 34,
    }),
    block({
      id: 'old',
      startAtMs: 120_000,
      endAtMs: 180_000,
      maxAbsSpeedKmh: 25,
      maxGpsSpeedKmh: 18,
    }),
  ])
  expect(sessions[0].maxSpeedKmh).toBe(34)
})

test('returns newest-first sessions', () => {
  const sessions = groupHistorySessions([
    block({ id: 'new', startAtMs: 900_000, endAtMs: 960_000 }),
    block({ id: 'old', startAtMs: 120_000, endAtMs: 180_000 }),
  ])
  expect(sessions[0].startAtMs).toBe(900_000)
  expect(sessions[1].startAtMs).toBe(120_000)
})

import { describe, expect, test } from 'bun:test'
import type { LiveStateEvent, LocationEvent, TelemetryEvent } from 'vesc-ble'

import { createLiveTelemetryRuntime } from './liveTelemetryRuntime'

function telemetry(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    generation: 7,
    hasFault: false,
    faultCode: 0,
    pitch: 1,
    roll: 2,
    balancePitch: 3,
    balanceCurrent: 4,
    speed: -15,
    batteryVoltage: 48,
    motorCurrent: 20,
    batteryCurrent: 7,
    erpm: 1000,
    dutyCycle: -0.5,
    state: 1,
    stateName: 'running',
    switchState: 0,
    adc1: 0.1,
    adc2: 0.2,
    odometer: 123,
    tempMosfet: 40,
    tempMotor: 35,
    avgLatency: 18,
    lastPacketAt: 10_000,
    ...overrides,
  }
}

function liveState(samples: TelemetryEvent[]): LiveStateEvent {
  return {
    board: {
      phase: 'connected',
      selectedBoardId: 'board-1',
      connectedBoardId: 'board-1',
      bleId: 'ble-1',
      name: 'Board',
      connectionSeq: 7,
      lastTelemetryAt: samples.at(-1)?.lastPacketAt ?? null,
      recentTelemetry: samples,
      error: null,
      autoConnect: true,
    },
    gps: {
      phase: 'active',
      latestFix: null,
      recentLocations: [],
      error: null,
    },
    scan: {
      phase: 'idle',
      devices: [],
      error: null,
    },
    recording: {
      enabled: false,
      activeBoardId: null,
      startedAt: null,
    },
  }
}

function location(overrides: Partial<LocationEvent> = {}): LocationEvent {
  return {
    latitude: 50,
    longitude: 19,
    speedMps: 4,
    bearingDeg: 90,
    accuracyM: 3,
    altitudeM: 250,
    timestamp: 10_000,
    precise: true,
    saved: true,
    ...overrides,
  }
}

describe('live telemetry runtime', () => {
  test('seeds hot values and history from native snapshot', () => {
    const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })
    runtime.seedFromLiveState(
      liveState([
        telemetry({ lastPacketAt: 9_000, speed: 3 }),
        telemetry({ lastPacketAt: 10_000, speed: -8 }),
      ]),
    )

    expect(runtime.values.speedKmh.value).toBe(8)
    expect(runtime.values.dutyPercent.value).toBe(50)
    expect(runtime.getSnapshot().liveMetricHistory.speed).toEqual([
      { ts: 9_000, value: 3 },
      { ts: 10_000, value: 8 },
    ])
  })

  test('ignores stale generation frames', () => {
    const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })
    runtime.seedFromLiveState(liveState([]))

    runtime.ingestTelemetry(telemetry({ generation: 6, speed: 30 }))

    expect(runtime.values.speedKmh.value).toBe(null)
    expect(runtime.getSnapshot().liveStatus.boardSampleCount).toBe(0)
  })

  test('ingests current generation frames into hot values and summary', () => {
    const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })
    runtime.seedFromLiveState(liveState([]))

    runtime.ingestTelemetry(telemetry({ speed: -22, dutyCycle: 0.25, avgLatency: 11 }))

    expect(runtime.values.speedKmh.value).toBe(22)
    expect(runtime.values.dutyPercent.value).toBe(25)
    expect(runtime.values.avgLatencyMs.value).toBe(11)
    expect(runtime.getSnapshot().liveStatus.boardAvgLatencyMs).toBe(11)
  })

  test('does not regress hot values when older current-generation telemetry arrives late', () => {
    const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })
    runtime.seedFromLiveState(liveState([]))

    runtime.ingestTelemetry(telemetry({ lastPacketAt: 20_000, speed: -30, avgLatency: 9 }))
    runtime.ingestTelemetry(telemetry({ lastPacketAt: 10_000, speed: -5, avgLatency: 40 }))

    expect(runtime.values.speedKmh.value).toBe(30)
    expect(runtime.values.avgLatencyMs.value).toBe(9)
    expect(runtime.getSnapshot().liveStatus.boardLastPacketAt).toBe(20_000)
    expect(runtime.getSnapshot().liveMetricHistory.speed).toEqual([
      { ts: 10_000, value: 5 },
      { ts: 20_000, value: 30 },
    ])
  })

  test('ingests locations into location history and status', () => {
    const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })

    const snapshot = runtime.ingestLocation(location({ timestamp: 12_000, accuracyM: 5 }))

    expect(snapshot.liveLocationHistory).toEqual([location({ timestamp: 12_000, accuracyM: 5 })])
    expect(snapshot.liveStatus).toMatchObject({
      gpsSampleCount: 1,
      gpsLastFixAt: 12_000,
      gpsPrecise: true,
      gpsAccuracyM: 5,
    })
  })

  test('reset clears hot values and snapshot', () => {
    const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })
    runtime.seedFromLiveState(liveState([]))
    runtime.ingestTelemetry(telemetry({ speed: -22, dutyCycle: 0.25, avgLatency: 11 }))
    runtime.ingestLocation(location({ timestamp: 12_000 }))

    const snapshot = runtime.reset()

    expect(runtime.values.speedKmh.value).toBe(null)
    expect(runtime.values.dutyPercent.value).toBe(null)
    expect(runtime.values.avgLatencyMs.value).toBe(null)
    expect(snapshot.liveLocationHistory).toEqual([])
    expect(snapshot.liveMetricHistory.speed).toEqual([])
    expect(snapshot.liveStatus).toEqual({
      boardSampleCount: 0,
      boardLastPacketAt: null,
      boardAvgLatencyMs: null,
      gpsSampleCount: 0,
      gpsLastFixAt: null,
      gpsPrecise: false,
      gpsAccuracyM: null,
    })
  })
})

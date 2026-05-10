# Live Telemetry Shared Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-frame `recentTelemetry` React state with SharedValue-driven hot readouts and throttled recent live metric history.

**Architecture:** Native remains the durable telemetry owner. JS keeps module-scope Reanimated shared values for hot metrics, a mutable recent-history runtime for the five-minute window, and Zustand only for connection state, live status summaries, and throttled metric history. UI consumers migrate from full telemetry arrays to either hot shared values or metric-specific live history.

**Tech Stack:** Expo SDK 55, React Native 0.83, React 19, Reanimated 4, Zustand 5, Bun test runner, `react-native-svg`.

---

## File Structure

- Create `src/telemetry/liveMetricHistory.ts`: pure ring-buffer and projection helpers. No React, no Reanimated.
- Create `src/telemetry/liveMetricHistory.test.ts`: unit tests for seeding, pruning, status summary, generation filtering support, and metric projections.
- Create `src/telemetry/liveTelemetryRuntime.ts`: hot SharedValues, mutable runtime state, snapshot seeding, telemetry ingestion, location ingestion, throttled publishing.
- Modify `src/store/bleStore.ts`: remove public `recentTelemetry` and `recentLocations`; add `liveMetricHistory`, `liveLocationHistory`, and `liveStatus`; route native snapshot and telemetry/location events through runtime.
- Modify `src/components/charts/Sparkline.tsx`: export `SparklinePoint` compatibility or rename to `LiveMetricPoint` if the task touches all consumers at once.
- Modify `src/components/TelemetryCard.tsx`: support animated value slots while keeping normal text for slow cards.
- Modify hot cards in `src/components/cards/`: `SpeedIndicator.tsx`, `DutyCard.tsx`, `MotorCurrentCard.tsx`, `BattCurrentCard.tsx`, `BatteryIndicator.tsx`, `MotorTempCard.tsx`, `ControllerTempCard.tsx`.
- Modify detail screens in `src/app/control/**/index.tsx`: use metric-specific live history instead of mapping `recentTelemetry`.
- Modify `src/components/charts/SpeedGauge.tsx`: drive speed number, arc, wedge, and marker from a SharedValue.
- Modify `src/components/LiveStatusBar.tsx`: subscribe to connection state and `liveStatus`, not full telemetry/location arrays.
- Modify `src/components/StatusPill.tsx`, `src/components/cards/StateCard.tsx`, `src/components/cards/ImuCard.tsx`, `src/components/cards/FootpadCard.tsx`, `src/components/cards/TargetSection.tsx`, `src/screens/MapScreen.tsx`: migrate remaining telemetry/location consumers.

## Task 1: Pure Live Metric History

**Files:**
- Create: `src/telemetry/liveMetricHistory.ts`
- Create: `src/telemetry/liveMetricHistory.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/telemetry/liveMetricHistory.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { LocationEvent, TelemetryEvent } from 'vesc-ble'

import {
  appendLocationSample,
  appendTelemetrySample,
  createLiveMetricBuffer,
  getLatestGps,
  getLatestTelemetry,
  type LiveMetricBuffer,
  projectLiveMetricHistory,
  summarizeLiveStatus,
} from './liveMetricHistory'

function telemetry(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    generation: 1,
    hasFault: false,
    faultCode: 0,
    pitch: 1,
    roll: 2,
    balancePitch: 3,
    balanceCurrent: 4,
    speed: 12,
    batteryVoltage: 48,
    motorCurrent: 20,
    batteryCurrent: 7,
    erpm: 1000,
    dutyCycle: 0.42,
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

describe('live metric history', () => {
  test('appends telemetry, prunes by live window, and projects metrics', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 0, speed: 1 }), 10_000)
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 5_000, speed: -8 }), 10_000)
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 11_000, speed: 14 }), 10_000)

    const history = projectLiveMetricHistory(buffer)

    expect(history.speed).toEqual([
      { ts: 5_000, value: 8 },
      { ts: 11_000, value: 14 },
    ])
    expect(history.duty).toEqual([
      { ts: 5_000, value: 42 },
      { ts: 11_000, value: 42 },
    ])
  })

  test('deduplicates telemetry samples by timestamp', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 1_000, speed: 1 }), 10_000)
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 1_000, speed: 2 }), 10_000)

    expect(projectLiveMetricHistory(buffer).speed).toEqual([{ ts: 1_000, value: 1 }])
  })

  test('summarizes board and GPS freshness without exposing sample arrays', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 2_000, avgLatency: 25 }), 10_000)
    appendLocationSample(buffer, location({ timestamp: 3_000, precise: false, accuracyM: 12 }), 10_000)

    expect(summarizeLiveStatus(buffer)).toEqual({
      boardSampleCount: 1,
      boardLastPacketAt: 2_000,
      boardAvgLatencyMs: 25,
      gpsSampleCount: 1,
      gpsLastFixAt: 3_000,
      gpsPrecise: false,
      gpsAccuracyM: 12,
    })
  })

  test('returns latest telemetry and GPS samples for shared value seeding', () => {
    const buffer = createLiveMetricBuffer()
    appendTelemetrySample(buffer, telemetry({ lastPacketAt: 2_000, speed: 9 }), 10_000)
    appendLocationSample(buffer, location({ timestamp: 3_000, speedMps: 5 }), 10_000)

    expect(getLatestTelemetry(buffer)?.speed).toBe(9)
    expect(getLatestGps(buffer)?.speedMps).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test src/telemetry/liveMetricHistory.test.ts
```

Expected: FAIL because `src/telemetry/liveMetricHistory.ts` does not exist.

- [ ] **Step 3: Implement pure helper**

Create `src/telemetry/liveMetricHistory.ts`:

```ts
import type { LocationEvent, TelemetryEvent } from 'vesc-ble'

export interface LiveMetricPoint {
  ts: number
  value: number
}

export interface LiveMetricHistory {
  speed: LiveMetricPoint[]
  duty: LiveMetricPoint[]
  motorCurrent: LiveMetricPoint[]
  batteryCurrent: LiveMetricPoint[]
  batteryVoltage: LiveMetricPoint[]
  motorTemp: LiveMetricPoint[]
  controllerTemp: LiveMetricPoint[]
  footpadAdc1: LiveMetricPoint[]
  footpadAdc2: LiveMetricPoint[]
  pitch: LiveMetricPoint[]
  roll: LiveMetricPoint[]
  balancePitch: LiveMetricPoint[]
}

export interface LiveStatusSummary {
  boardSampleCount: number
  boardLastPacketAt: number | null
  boardAvgLatencyMs: number | null
  gpsSampleCount: number
  gpsLastFixAt: number | null
  gpsPrecise: boolean
  gpsAccuracyM: number | null
}

export interface LiveMetricBuffer {
  telemetry: TelemetryEvent[]
  locations: LocationEvent[]
}

export function createLiveMetricBuffer(): LiveMetricBuffer {
  return { telemetry: [], locations: [] }
}

export function clearLiveMetricBuffer(buffer: LiveMetricBuffer): void {
  buffer.telemetry.length = 0
  buffer.locations.length = 0
}

function pruneByTime<T>(items: T[], nowMs: number, windowMs: number, key: (item: T) => number) {
  const oldest = nowMs - windowMs
  let firstKept = 0
  while (firstKept < items.length && key(items[firstKept]) < oldest) firstKept += 1
  if (firstKept > 0) items.splice(0, firstKept)
}

function insertByTime<T>(items: T[], item: T, key: (item: T) => number): void {
  const itemKey = key(item)
  if (items.some((existing) => key(existing) === itemKey)) return
  const insertAt = items.findIndex((existing) => key(existing) > itemKey)
  if (insertAt === -1) items.push(item)
  else items.splice(insertAt, 0, item)
}

export function appendTelemetrySample(
  buffer: LiveMetricBuffer,
  telemetry: TelemetryEvent,
  windowMs: number,
): void {
  insertByTime(buffer.telemetry, telemetry, (sample) => sample.lastPacketAt)
  pruneByTime(buffer.telemetry, telemetry.lastPacketAt, windowMs, (sample) => sample.lastPacketAt)
}

export function appendLocationSample(
  buffer: LiveMetricBuffer,
  location: LocationEvent,
  windowMs: number,
): void {
  insertByTime(buffer.locations, location, (sample) => sample.timestamp)
  pruneByTime(buffer.locations, location.timestamp, windowMs, (sample) => sample.timestamp)
}

function metric(
  telemetry: TelemetryEvent[],
  pick: (sample: TelemetryEvent) => number | null | undefined,
): LiveMetricPoint[] {
  const points: LiveMetricPoint[] = []
  for (const sample of telemetry) {
    const value = pick(sample)
    if (value == null || !Number.isFinite(value)) continue
    points.push({ ts: sample.lastPacketAt, value })
  }
  return points
}

export function projectLiveMetricHistory(buffer: LiveMetricBuffer): LiveMetricHistory {
  const telemetry = buffer.telemetry
  return {
    speed: metric(telemetry, (sample) => Math.abs(sample.speed)),
    duty: metric(telemetry, (sample) => Math.abs(sample.dutyCycle) * 100),
    motorCurrent: metric(telemetry, (sample) => sample.motorCurrent),
    batteryCurrent: metric(telemetry, (sample) => sample.batteryCurrent),
    batteryVoltage: metric(telemetry, (sample) => sample.batteryVoltage),
    motorTemp: metric(telemetry, (sample) => sample.tempMotor),
    controllerTemp: metric(telemetry, (sample) => sample.tempMosfet),
    footpadAdc1: metric(telemetry, (sample) => sample.adc1),
    footpadAdc2: metric(telemetry, (sample) => sample.adc2),
    pitch: metric(telemetry, (sample) => sample.pitch),
    roll: metric(telemetry, (sample) => sample.roll),
    balancePitch: metric(telemetry, (sample) => sample.balancePitch),
  }
}

export function summarizeLiveStatus(buffer: LiveMetricBuffer): LiveStatusSummary {
  const latestTelemetry = getLatestTelemetry(buffer)
  const latestGps = getLatestGps(buffer)
  return {
    boardSampleCount: buffer.telemetry.length,
    boardLastPacketAt: latestTelemetry?.lastPacketAt ?? null,
    boardAvgLatencyMs: latestTelemetry?.avgLatency ?? null,
    gpsSampleCount: buffer.locations.length,
    gpsLastFixAt: latestGps?.timestamp ?? null,
    gpsPrecise: latestGps?.precise ?? false,
    gpsAccuracyM: latestGps?.accuracyM ?? null,
  }
}

export function getLatestTelemetry(buffer: LiveMetricBuffer): TelemetryEvent | null {
  return buffer.telemetry.at(-1) ?? null
}

export function getLatestGps(buffer: LiveMetricBuffer): LocationEvent | null {
  return buffer.locations.at(-1) ?? null
}

export function emptyLiveMetricHistory(): LiveMetricHistory {
  return {
    speed: [],
    duty: [],
    motorCurrent: [],
    batteryCurrent: [],
    batteryVoltage: [],
    motorTemp: [],
    controllerTemp: [],
    footpadAdc1: [],
    footpadAdc2: [],
    pitch: [],
    roll: [],
    balancePitch: [],
  }
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
bun test src/telemetry/liveMetricHistory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry/liveMetricHistory.ts src/telemetry/liveMetricHistory.test.ts
git commit -m "Add live metric history buffer"
```

## Task 2: Live Telemetry Runtime

**Files:**
- Create: `src/telemetry/liveTelemetryRuntime.ts`
- Create: `src/telemetry/liveTelemetryRuntime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `src/telemetry/liveTelemetryRuntime.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { LiveStateEvent, TelemetryEvent } from 'vesc-ble'

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
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test src/telemetry/liveTelemetryRuntime.test.ts
```

Expected: FAIL because `src/telemetry/liveTelemetryRuntime.ts` does not exist.

- [ ] **Step 3: Implement runtime**

Create `src/telemetry/liveTelemetryRuntime.ts`:

```ts
import { makeMutable, type SharedValue } from 'react-native-reanimated'
import type { LiveStateEvent, LocationEvent, TelemetryEvent } from 'vesc-ble'

import {
  appendLocationSample,
  appendTelemetrySample,
  clearLiveMetricBuffer,
  createLiveMetricBuffer,
  emptyLiveMetricHistory,
  getLatestTelemetry,
  projectLiveMetricHistory,
  summarizeLiveStatus,
  type LiveMetricHistory,
  type LiveStatusSummary,
} from './liveMetricHistory'

export interface LiveTelemetryValues {
  speedKmh: SharedValue<number | null>
  dutyPercent: SharedValue<number | null>
  motorCurrent: SharedValue<number | null>
  batteryCurrent: SharedValue<number | null>
  batteryVoltage: SharedValue<number | null>
  motorTemp: SharedValue<number | null>
  controllerTemp: SharedValue<number | null>
  lastPacketAt: SharedValue<number | null>
  avgLatencyMs: SharedValue<number | null>
}

export interface LiveTelemetrySnapshot {
  liveMetricHistory: LiveMetricHistory
  liveLocationHistory: LocationEvent[]
  liveStatus: LiveStatusSummary
}

interface RuntimeOptions {
  windowMs: () => number
}

const EMPTY_STATUS: LiveStatusSummary = {
  boardSampleCount: 0,
  boardLastPacketAt: null,
  boardAvgLatencyMs: null,
  gpsSampleCount: 0,
  gpsLastFixAt: null,
  gpsPrecise: false,
  gpsAccuracyM: null,
}

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

function updateHotValues(values: LiveTelemetryValues, telemetry: TelemetryEvent | null): void {
  if (!telemetry) {
    values.speedKmh.value = null
    values.dutyPercent.value = null
    values.motorCurrent.value = null
    values.batteryCurrent.value = null
    values.batteryVoltage.value = null
    values.motorTemp.value = null
    values.controllerTemp.value = null
    values.lastPacketAt.value = null
    values.avgLatencyMs.value = null
    return
  }

  values.speedKmh.value = Math.abs(telemetry.speed)
  values.dutyPercent.value = Math.abs(telemetry.dutyCycle) * 100
  values.motorCurrent.value = finite(telemetry.motorCurrent)
  values.batteryCurrent.value = finite(telemetry.batteryCurrent)
  values.batteryVoltage.value = finite(telemetry.batteryVoltage)
  values.motorTemp.value = finite(telemetry.tempMotor)
  values.controllerTemp.value = finite(telemetry.tempMosfet)
  values.lastPacketAt.value = telemetry.lastPacketAt
  values.avgLatencyMs.value = finite(telemetry.avgLatency)
}

export function createLiveTelemetryRuntime(options: RuntimeOptions) {
  const buffer = createLiveMetricBuffer()
  let connectionSeq = 0
  let snapshot: LiveTelemetrySnapshot = {
    liveMetricHistory: emptyLiveMetricHistory(),
    liveLocationHistory: [],
    liveStatus: EMPTY_STATUS,
  }

  const values: LiveTelemetryValues = {
    speedKmh: makeMutable<number | null>(null),
    dutyPercent: makeMutable<number | null>(null),
    motorCurrent: makeMutable<number | null>(null),
    batteryCurrent: makeMutable<number | null>(null),
    batteryVoltage: makeMutable<number | null>(null),
    motorTemp: makeMutable<number | null>(null),
    controllerTemp: makeMutable<number | null>(null),
    lastPacketAt: makeMutable<number | null>(null),
    avgLatencyMs: makeMutable<number | null>(null),
  }

  function publishSnapshot(): LiveTelemetrySnapshot {
    snapshot = {
      liveMetricHistory: projectLiveMetricHistory(buffer),
      liveLocationHistory: [...buffer.locations],
      liveStatus: summarizeLiveStatus(buffer),
    }
    return snapshot
  }

  function seedFromLiveState(state: LiveStateEvent): LiveTelemetrySnapshot {
    connectionSeq = state.board.connectionSeq
    clearLiveMetricBuffer(buffer)
    for (const sample of state.board.recentTelemetry) {
      appendTelemetrySample(buffer, sample, options.windowMs())
      if (sample.location) appendLocationSample(buffer, sample.location, options.windowMs())
    }
    for (const fix of state.gps.recentLocations) {
      appendLocationSample(buffer, fix, options.windowMs())
    }
    updateHotValues(values, getLatestTelemetry(buffer))
    return publishSnapshot()
  }

  function ingestTelemetry(telemetry: TelemetryEvent): LiveTelemetrySnapshot | null {
    if (telemetry.generation != null && telemetry.generation !== connectionSeq) return null
    updateHotValues(values, telemetry)
    appendTelemetrySample(buffer, telemetry, options.windowMs())
    if (telemetry.location) appendLocationSample(buffer, telemetry.location, options.windowMs())
    return publishSnapshot()
  }

  function ingestLocation(location: LocationEvent): LiveTelemetrySnapshot {
    appendLocationSample(buffer, location, options.windowMs())
    return publishSnapshot()
  }

  function reset(): LiveTelemetrySnapshot {
    clearLiveMetricBuffer(buffer)
    updateHotValues(values, null)
    return publishSnapshot()
  }

  return {
    values,
    seedFromLiveState,
    ingestTelemetry,
    ingestLocation,
    reset,
    getSnapshot: () => snapshot,
  }
}

export const liveTelemetryRuntime = createLiveTelemetryRuntime({
  windowMs: () => 5 * 60_000,
})
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
bun test src/telemetry/liveTelemetryRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry/liveTelemetryRuntime.ts src/telemetry/liveTelemetryRuntime.test.ts
git commit -m "Add live telemetry runtime"
```

## Task 3: Wire Runtime Into BLE Store

**Files:**
- Modify: `src/store/bleStore.ts`

- [ ] **Step 1: Write failing store-level type check by editing state shape**

In `src/store/bleStore.ts`, replace state fields:

```ts
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'
import {
  emptyLiveMetricHistory,
  type LiveMetricHistory,
  type LiveStatusSummary,
} from '@/telemetry/liveMetricHistory'
```

Change `BleState`:

```ts
interface BleState {
  status: BleStatus
  gpsStatus: GpsPhase
  scanStatus: ScanStatus
  connectionSeq: number
  lastTelemetryAt: number | null
  nativeStateReady: boolean
  devices: ScannedDevice[]
  selectedBoardId: string | null
  connectedId: string | null
  error: string | undefined
  liveMetricHistory: LiveMetricHistory
  liveLocationHistory: LocationEvent[]
  liveStatus: LiveStatusSummary
  telemetryRecordingEnabled: boolean
  recordDebugSession: boolean
}
```

Add constant:

```ts
const EMPTY_LIVE_STATUS: LiveStatusSummary = {
  boardSampleCount: 0,
  boardLastPacketAt: null,
  boardAvgLatencyMs: null,
  gpsSampleCount: 0,
  gpsLastFixAt: null,
  gpsPrecise: false,
  gpsAccuracyM: null,
}
```

Run:

```bash
bun run ts
```

Expected: FAIL with references to removed `recentTelemetry` and `recentLocations`.

- [ ] **Step 2: Replace native snapshot application**

In `applyLiveState`, replace recent array assignment with runtime seeding:

```ts
function applyLiveState(state: LiveStateEvent, set: BleSet): void {
  const live = liveTelemetryRuntime.seedFromLiveState(state)
  set({
    status: state.board.phase,
    gpsStatus: state.gps.phase,
    scanStatus: state.scan.phase,
    connectionSeq: state.board.connectionSeq,
    lastTelemetryAt: state.board.lastTelemetryAt,
    nativeStateReady: true,
    selectedBoardId: state.board.selectedBoardId,
    connectedId: state.board.connectedBoardId ?? state.board.bleId,
    error: state.board.error ?? state.gps.error ?? state.scan.error ?? undefined,
    telemetryRecordingEnabled: state.recording.enabled,
    liveMetricHistory: live.liveMetricHistory,
    liveLocationHistory: live.liveLocationHistory,
    liveStatus: live.liveStatus,
  })
}
```

- [ ] **Step 3: Replace telemetry/location listener updates**

In `installLiveSubscriptions`, replace telemetry listener body:

```ts
telemetrySub = addTelemetryListener((telemetry) => {
  const live = liveTelemetryRuntime.ingestTelemetry(telemetry)
  if (!live) return
  set({
    lastTelemetryAt: telemetry.lastPacketAt,
    liveMetricHistory: live.liveMetricHistory,
    liveLocationHistory: live.liveLocationHistory,
    liveStatus: live.liveStatus,
  })
})
```

Add location subscription if one already exists in the file, or create it with the existing imported `addLocationListener`:

```ts
let locationSub: EventSubscription | null = null
```

Inside `installLiveSubscriptions`:

```ts
if (!locationSub) {
  locationSub = addLocationListener((location) => {
    const live = liveTelemetryRuntime.ingestLocation(location)
    set({ liveLocationHistory: live.liveLocationHistory, liveStatus: live.liveStatus })
  })
}
```

- [ ] **Step 4: Initialize store fields**

In `create<BleState & BleActions>`, replace old array defaults:

```ts
liveMetricHistory: emptyLiveMetricHistory(),
liveLocationHistory: [],
liveStatus: EMPTY_LIVE_STATUS,
```

Delete `recentTelemetry: []` and `recentLocations: []`.

- [ ] **Step 5: Run type check**

Run:

```bash
bun run ts
```

Expected: FAIL only in UI files that still read `recentTelemetry` or `recentLocations`.

- [ ] **Step 6: Commit store wiring**

```bash
git add src/store/bleStore.ts
git commit -m "Route live telemetry through runtime"
```

## Task 4: SpeedGauge SharedValue Hot Path

**Files:**
- Modify: `src/components/charts/SpeedGauge.tsx`
- Modify: `src/components/cards/SpeedIndicator.tsx`

- [ ] **Step 1: Convert SpeedGauge props**

In `SpeedGauge.tsx`, import Reanimated:

```ts
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'
```

Change props:

```ts
interface Props {
  value: SharedValue<number | null>
  series?: SparklinePoint[]
  windowMs?: number
  gpsValue?: number | null
  distance?: string
  max?: number
  alerts?: SpeedGaugeAlert[]
}
```

- [ ] **Step 2: Add animated SVG and text wrappers**

Near constants:

```ts
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)
```

Add `TextInput` to React Native imports.

- [ ] **Step 3: Drive arc, wedge, marker, and text from SharedValue**

Inside `SpeedGauge`, replace `fraction`, `activeArc`, and `wedge` render-time calculations with:

```ts
const animatedValueProps = useAnimatedProps(() => {
  const current = value.value
  return {
    text: current != null ? Math.round(current).toString() : '—',
    value: current != null ? Math.round(current).toString() : '—',
  }
})

const animatedArcProps = useAnimatedProps(() => {
  const current = value.value ?? 0
  return { d: arcPath(clamp01(current / max)) }
})

const animatedWedgeProps = useAnimatedProps(() => {
  const current = value.value ?? 0
  return { d: wedgePath(clamp01(current / max)) }
})

const animatedMarkerProps = useAnimatedProps(() => {
  const current = value.value ?? 0
  const fraction = clamp01(current / max)
  const inner = polar(R - MARKER_INSET, fraction)
  const outer = polar(R + STROKE / 2, fraction)
  return {
    x1: inner.x,
    y1: inner.y,
    x2: outer.x,
    y2: outer.y,
  }
})
```

Use `theme.wheel.color` for animated arc/marker color in first pass:

```tsx
<AnimatedPath animatedProps={animatedWedgeProps} fill={`url(#${GLOW_GRADIENT_ID})`} stroke="none" />
<AnimatedPath
  animatedProps={animatedArcProps}
  stroke={theme.wheel.color}
  strokeWidth={STROKE}
  strokeLinecap="butt"
  fill="none"
/>
<AnimatedLine
  animatedProps={animatedMarkerProps}
  stroke={theme.wheel.color}
  strokeWidth={1.5}
  strokeLinecap="round"
/>
<AnimatedTextInput
  editable={false}
  animatedProps={animatedValueProps}
  style={styles.value}
/>
```

Remove `Marker` usage for the live speed marker.

- [ ] **Step 4: Update SpeedIndicator**

In `src/components/cards/SpeedIndicator.tsx`, import runtime:

```ts
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'
```

Replace `recentTelemetry` selector with:

```ts
const speed = useBleStore((s) => s.liveMetricHistory.speed)
const gpsSpeedKmh = null
const distance = undefined
```

Delete this old selector shape:

```ts
const { recentTelemetry, recentLocations } = useBleStore(
  useShallow((s) => {
    return { recentTelemetry: s.recentTelemetry, recentLocations: s.recentLocations }
  }),
)
```

Pass shared speed:

```tsx
<SpeedGauge
  value={liveTelemetryRuntime.values.speedKmh}
  gpsValue={gpsSpeedKmh}
  series={speed}
  windowMs={windowMs}
  distance={distance}
  max={SPEED_GAUGE_MAX_KMH}
  alerts={speedAlerts}
/>
```

Keep GPS speed and distance null in this task.

- [ ] **Step 5: Run type check**

Run:

```bash
bun run ts
```

Expected: SpeedGauge-related errors fixed; other `recentTelemetry` consumers still fail.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/SpeedGauge.tsx src/components/cards/SpeedIndicator.tsx
git commit -m "Drive speed gauge from shared value"
```

## Task 5: Hot Telemetry Cards

**Files:**
- Modify: `src/components/TelemetryCard.tsx`
- Modify: `src/components/cards/DutyCard.tsx`
- Modify: `src/components/cards/MotorCurrentCard.tsx`
- Modify: `src/components/cards/BattCurrentCard.tsx`
- Modify: `src/components/cards/BatteryIndicator.tsx`
- Modify: `src/components/cards/MotorTempCard.tsx`
- Modify: `src/components/cards/ControllerTempCard.tsx`

- [ ] **Step 1: Add animated value support to TelemetryCard**

In `src/components/TelemetryCard.tsx`, add imports:

```ts
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'
import { TextInput } from 'react-native'
```

Add helper component before `TelemetryCard`:

```tsx
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

function AnimatedTelemetryValue({
  value,
  format,
  unit,
}: {
  value: SharedValue<number | null>
  format: (value: number) => string
  unit?: string
}) {
  const animatedProps = useAnimatedProps(() => {
    const current = value.value
    const text = current == null ? '-' : `${format(current)}${unit ? ` ${unit}` : ''}`
    return { text, value: text }
  })

  return (
    <AnimatedTextInput
      editable={false}
      animatedProps={animatedProps}
      style={styles.value}
    />
  )
}
```

Extend props:

```ts
animatedValue?: SharedValue<number | null>
formatAnimatedValue?: (value: number) => string
```

Replace value render:

```tsx
{animatedValue && formatAnimatedValue ? (
  <AnimatedTelemetryValue value={animatedValue} format={formatAnimatedValue} unit={unit} />
) : (
  <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
    {value}
    {unit ? <Text style={styles.unit}> {unit}</Text> : null}
    {sub ? <Text style={styles.sub}> {sub}</Text> : null}
  </Text>
)}
```

- [ ] **Step 2: Update DutyCard**

Replace `recentTelemetry` usage:

```ts
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'
```

Use store:

```ts
const series = useBleStore((s) => s.liveMetricHistory.duty)
```

Render:

```tsx
<TelemetryCard
  controlId="duty"
  label="Duty Cycle"
  value={DASH}
  unit="%"
  animatedValue={liveTelemetryRuntime.values.dutyPercent}
  formatAnimatedValue={(value) => value.toFixed(0)}
  series={series}
  seriesColor={theme.bran.color}
  fmtMax={FMT_MAX}
  range={RANGE}
  windowMs={windowMs}
/>
```

- [ ] **Step 3: Update current and temp cards**

For `MotorCurrentCard.tsx`:

```ts
const series = useBleStore((s) => s.liveMetricHistory.motorCurrent)
animatedValue={liveTelemetryRuntime.values.motorCurrent}
formatAnimatedValue={fmt}
unit="A"
```

For `BattCurrentCard.tsx`:

```ts
const series = useBleStore((s) => s.liveMetricHistory.batteryCurrent)
animatedValue={liveTelemetryRuntime.values.batteryCurrent}
formatAnimatedValue={fmt}
unit="A"
```

For `MotorTempCard.tsx`:

```ts
const series = useBleStore((s) => s.liveMetricHistory.motorTemp)
animatedValue={liveTelemetryRuntime.values.motorTemp}
formatAnimatedValue={fmt}
unit="°C"
```

For `ControllerTempCard.tsx`:

```ts
const series = useBleStore((s) => s.liveMetricHistory.controllerTemp)
animatedValue={liveTelemetryRuntime.values.controllerTemp}
formatAnimatedValue={fmt}
unit="°C"
```

- [ ] **Step 4: Update BatteryIndicator**

Use:

```ts
const batterySeries = useBleStore((s) => s.liveMetricHistory.batteryVoltage)
```

Keep smoothing inside `useMemo`, but input is now `batterySeries` instead of mapping telemetry:

```ts
const smooth = emaSeries(batterySeries, BATTERY_SMOOTH_HALF_LIFE_MS)
```

In this task, React-rendered voltage comes from smoothed throttled series.

- [ ] **Step 5: Run type check**

Run:

```bash
bun run ts
```

Expected: card errors reduced; detail screens and status components still fail.

- [ ] **Step 6: Commit**

```bash
git add src/components/TelemetryCard.tsx src/components/cards
git commit -m "Use shared values for hot telemetry cards"
```

## Task 6: LiveStatusBar Summary Path

**Files:**
- Modify: `src/components/LiveStatusBar.tsx`

- [ ] **Step 1: Replace array subscription**

Replace store selector:

```ts
const { liveStatus, status, scanStatus } = useBleStore(
  useShallow((s) => ({
    liveStatus: s.liveStatus,
    status: s.status,
    scanStatus: s.scanStatus,
  })),
)
```

Replace latest values:

```ts
const telemetryAgeMs = liveStatus.boardLastPacketAt ? nowMs - liveStatus.boardLastPacketAt : null
const gpsAgeMs = liveStatus.gpsLastFixAt ? nowMs - liveStatus.gpsLastFixAt : null
const gpsAgeSec = gpsAgeMs != null ? gpsAgeMs / 1000 : null
const gpsFix = liveStatus.gpsLastFixAt
  ? {
      timestamp: liveStatus.gpsLastFixAt,
      precise: liveStatus.gpsPrecise,
      accuracyM: liveStatus.gpsAccuracyM,
    }
  : null
```

Replace counts and latency:

```ts
const boardText =
  liveStatus.boardAvgLatencyMs != null ? `${Math.round(liveStatus.boardAvgLatencyMs)}ms` : '-'
const boardMeta = status === 'connected' ? formatLastSec(telemetryAgeMs) : formatLastSec(telemetryAgeMs)
```

Use `liveStatus.boardSampleCount` and `liveStatus.gpsSampleCount` in labels.

- [ ] **Step 2: Run type check**

Run:

```bash
bun run ts
```

Expected: `LiveStatusBar.tsx` no longer references `recentTelemetry` or `recentLocations`.

- [ ] **Step 3: Commit**

```bash
git add src/components/LiveStatusBar.tsx
git commit -m "Make live status bar use summary state"
```

## Task 7: Remaining Consumers

**Files:**
- Modify: `src/app/control/batt-current/index.tsx`
- Modify: `src/app/control/battery/index.tsx`
- Modify: `src/app/control/controller-temp/index.tsx`
- Modify: `src/app/control/duty/index.tsx`
- Modify: `src/app/control/footpad/index.tsx`
- Modify: `src/app/control/imu/index.tsx`
- Modify: `src/app/control/motor-current/index.tsx`
- Modify: `src/app/control/motor-temp/index.tsx`
- Modify: `src/app/control/speed/index.tsx`
- Modify: `src/app/control/state/index.tsx`
- Modify: `src/components/cards/FootpadCard.tsx`
- Modify: `src/components/cards/ImuCard.tsx`
- Modify: `src/components/cards/StateCard.tsx`
- Modify: `src/components/StatusPill.tsx`
- Modify: `src/components/cards/TargetSection.tsx`
- Modify: `src/screens/MapScreen.tsx`
- Modify: `src/components/TelemetryView.tsx`

- [ ] **Step 1: Replace detail chart mappings**

For each detail screen, replace:

```ts
const recentTelemetry = useBleStore((s) => s.recentTelemetry)
const points = useMemo(
  () => recentTelemetry.map((t) => ({ date: new Date(t.lastPacketAt), value: t.motorCurrent })),
  [recentTelemetry],
)
```

with metric-specific history:

```ts
const motorCurrent = useBleStore((s) => s.liveMetricHistory.motorCurrent)
const points = useMemo(
  () => motorCurrent.map((p) => ({ date: new Date(p.ts), value: p.value })),
  [motorCurrent],
)
```

Use metric mapping:

```ts
batt-current -> batteryCurrent
battery -> batteryVoltage
controller-temp -> controllerTemp
duty -> duty
footpad -> footpadAdc1 and footpadAdc2
imu -> pitch, roll, balancePitch
motor-current -> motorCurrent
motor-temp -> motorTemp
speed -> speed
```

- [ ] **Step 2: Replace remaining card mappings**

For `FootpadCard.tsx`:

```ts
const { footpadAdc1, footpadAdc2 } = useBleStore(
  useShallow((s) => ({
    footpadAdc1: s.liveMetricHistory.footpadAdc1,
    footpadAdc2: s.liveMetricHistory.footpadAdc2,
  })),
)
```

For `ImuCard.tsx`:

```ts
const { pitch, roll, balancePitch } = useBleStore(
  useShallow((s) => ({
    pitch: s.liveMetricHistory.pitch,
    roll: s.liveMetricHistory.roll,
    balancePitch: s.liveMetricHistory.balancePitch,
  })),
)
```

For `StateCard.tsx`, use `liveStatus.boardLastPacketAt` to show connected/live state until a specific state shared value is added:

```ts
const hasLiveTelemetry = useBleStore((s) => s.liveStatus.boardLastPacketAt != null)
```

- [ ] **Step 3: Replace location consumers**

For `TargetSection.tsx` and `StatusPill.tsx`, use `liveStatus` for freshness. For `MapScreen.tsx`, use `liveLocationHistory`, which is throttled through runtime snapshots. Do not restore per-frame `recentLocations`.

Use this selector in `MapScreen.tsx`:

```ts
const recentLocations = useBleStore((s) => s.liveLocationHistory)
```

Use this GPS freshness selector in `TargetSection.tsx` and `StatusPill.tsx`:

```ts
const liveStatus = useBleStore((s) => s.liveStatus)
```

- [ ] **Step 4: Update TelemetryView live check**

Replace:

```ts
const hasLiveBoardData = useBleStore(
  (s) => s.status === 'connected' && s.recentTelemetry.length > 0,
)
```

with:

```ts
const hasLiveBoardData = useBleStore(
  (s) => s.status === 'connected' && s.liveStatus.boardSampleCount > 0,
)
```

- [ ] **Step 5: Run search and type check**

Run:

```bash
rg "recentTelemetry|recentLocations" src
bun run ts
```

Expected: `rg` returns no UI-store consumers except native type names in `modules/vesc-ble/src/index.ts` and snapshot handling in `bleStore.ts`; `bun run ts` passes.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Migrate telemetry consumers to live history"
```

## Task 8: Throttle Publishing

**Files:**
- Modify: `src/telemetry/liveTelemetryRuntime.ts`
- Modify: `src/store/bleStore.ts`
- Modify: `src/telemetry/liveTelemetryRuntime.test.ts`

- [ ] **Step 1: Add pending publish API test**

Add test:

```ts
test('coalesces telemetry frames until a publish is requested', () => {
  const runtime = createLiveTelemetryRuntime({ windowMs: () => 60_000 })
  runtime.seedFromLiveState(liveState([]))

  runtime.ingestTelemetry(telemetry({ lastPacketAt: 1_000, speed: 1 }))
  runtime.ingestTelemetry(telemetry({ lastPacketAt: 1_050, speed: 2 }))

  expect(runtime.values.speedKmh.value).toBe(2)
  expect(runtime.consumePendingSnapshot()?.liveMetricHistory.speed).toEqual([
    { ts: 1_000, value: 1 },
    { ts: 1_050, value: 2 },
  ])
  expect(runtime.consumePendingSnapshot()).toBe(null)
})
```

Update the existing `ingests current generation frames into hot values and summary` test:

```ts
runtime.ingestTelemetry(telemetry({ speed: -22, dutyCycle: 0.25, avgLatency: 11 }))

expect(runtime.values.speedKmh.value).toBe(22)
expect(runtime.values.dutyPercent.value).toBe(25)
expect(runtime.values.avgLatencyMs.value).toBe(11)
expect(runtime.consumePendingSnapshot()?.liveStatus.boardAvgLatencyMs).toBe(11)
```

- [ ] **Step 2: Implement pending snapshot**

In runtime:

```ts
let pendingSnapshot = false

function markPending(): void {
  pendingSnapshot = true
}

function consumePendingSnapshot(): LiveTelemetrySnapshot | null {
  if (!pendingSnapshot) return null
  pendingSnapshot = false
  return publishSnapshot()
}
```

Replace `ingestTelemetry`:

```ts
function ingestTelemetry(telemetry: TelemetryEvent): boolean {
  if (telemetry.generation != null && telemetry.generation !== connectionSeq) return false
  updateHotValues(values, telemetry)
  appendTelemetrySample(buffer, telemetry, options.windowMs())
  if (telemetry.location) appendLocationSample(buffer, telemetry.location, options.windowMs())
  markPending()
  return true
}
```

Replace `ingestLocation`:

```ts
function ingestLocation(location: LocationEvent): void {
  appendLocationSample(buffer, location, options.windowMs())
  markPending()
}
```

Expose `consumePendingSnapshot`.

- [ ] **Step 3: Add BLE store throttle**

In `bleStore.ts` module scope:

```ts
const LIVE_HISTORY_PUBLISH_MS = 250
let liveHistoryPublishTimer: ReturnType<typeof setTimeout> | null = null

function scheduleLiveHistoryPublish(set: BleSet): void {
  if (liveHistoryPublishTimer) return
  liveHistoryPublishTimer = setTimeout(() => {
    liveHistoryPublishTimer = null
    const live = liveTelemetryRuntime.consumePendingSnapshot()
    if (!live) return
    set({
      liveMetricHistory: live.liveMetricHistory,
      liveStatus: live.liveStatus,
    })
  }, LIVE_HISTORY_PUBLISH_MS)
}
```

Telemetry listener:

```ts
const accepted = liveTelemetryRuntime.ingestTelemetry(telemetry)
if (!accepted) return
set({ lastTelemetryAt: telemetry.lastPacketAt })
scheduleLiveHistoryPublish(set)
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test src/telemetry/liveTelemetryRuntime.test.ts src/telemetry/liveMetricHistory.test.ts
bun run ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry/liveTelemetryRuntime.ts src/telemetry/liveTelemetryRuntime.test.ts src/store/bleStore.ts
git commit -m "Throttle live history publishing"
```

## Task 9: Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run full checks**

Run:

```bash
bun test
bun run ts
bun run lint
```

Expected: all pass.

- [ ] **Step 2: Android manual smoke**

Run:

```bash
bun run android
```

Expected on device:

- Connect to board.
- Let telemetry run until five-minute window is full.
- Speed number, gauge arc, glow wedge, and marker track speed without visible lag.
- Duty, motor current, and battery current numbers do not visibly lag.
- LiveStatusBar updates board/GPS freshness and does not stutter.
- Sparklines update at throttled cadence and can lag slightly.
- JS reload seeds speed/status/history from native snapshot.

- [ ] **Step 3: Commit verification fixes when files changed**

When files changed during verification:

```bash
git add src
git commit -m "Fix live telemetry verification issues"
```

When no files changed during verification, skip this step.

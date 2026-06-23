import type { EventSubscription } from 'expo-modules-core'

import type {
  AppSettings,
  Board,
  BoardProbeProgressEvent,
  BoardProbeResult,
  DeviceFoundEvent,
  LiveStateEvent,
  TelemetryEvent,
} from './index'

const E2E_BOARD_SCAN_RESULT: DeviceFoundEvent = {
  id: 'E2:E2:E2:E2:E2:01',
  name: 'E2E VESC Board',
  rssi: -48,
  serviceUUIDs: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
}

let scanActive = false
let scanTimer: ReturnType<typeof setTimeout> | null = null
let selectedBoardId: string | null = null
let connectedBoardId: string | null = null
let connectingBoardId: string | null = null
let connectionSeq = 0
let lastTelemetry: TelemetryEvent | null = null
let connectTimer: ReturnType<typeof setTimeout> | null = null
let telemetryTimer: ReturnType<typeof setInterval> | null = null

const deviceListeners = new Set<(event: DeviceFoundEvent) => void>()
const liveStateListeners = new Set<(event: LiveStateEvent) => void>()
const telemetryListeners = new Set<(event: TelemetryEvent) => void>()
const boardProbeProgressListeners = new Set<(event: BoardProbeProgressEvent) => void>()

const e2eBoards: Board[] = []

const e2eSettings: AppSettings = {
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: false,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
  movingSpeedThresholdKmh: 5,
  freeSpinMaxSpeedDeltaKmh: 3,
  freeSpinStationaryBoardCapKmh: 1,
  mapStyleKey: 'onedark',
  mapNavigationMode: 'gpsHeading',
  historyMetricGradientsEnabled: true,
  historyMetricHotRanges: {},
  socEstimateWindowSeconds: 20,
  connectionSoundsEnabled: true,
}

function emitDevice(event: DeviceFoundEvent): void {
  for (const listener of deviceListeners) {
    listener(event)
  }
}

function clearScanTimer(): void {
  if (!scanTimer) return
  clearTimeout(scanTimer)
  scanTimer = null
}

function clearConnectTimer(): void {
  if (!connectTimer) return
  clearTimeout(connectTimer)
  connectTimer = null
}

// Chaotic-but-deterministic fake telemetry. A seeded random walk keeps the
// stream reproducible (so SVG vs Skia perf runs see an identical workload)
// while looking like a real noisy ride — sparklines fill with jagged lines
// and the gauges/IMU move constantly. Reset on each connect via resetSim().
interface SimState {
  speed: number
  duty: number
  motorCurrent: number
  batteryCurrent: number
  batteryVoltage: number
  batteryPercent: number
  tempMosfet: number
  tempMotor: number
  pitch: number
  roll: number
}

let rngState = 0
let sim: SimState | null = null

function rng(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0
  return rngState / 0xffffffff
}

function resetSim(): void {
  rngState = 0x9e3779b9
  sim = {
    speed: 18,
    duty: 0.4,
    motorCurrent: 12,
    batteryCurrent: -10,
    batteryVoltage: 75.6,
    batteryPercent: 78,
    tempMosfet: 38,
    tempMotor: 34,
    pitch: 0,
    roll: 0,
  }
}

/** Random-walk a value, with occasional larger spikes, clamped to [min, max]. */
function walk(value: number, step: number, min: number, max: number, spike = 0): number {
  let next = value + (rng() - 0.5) * step
  if (spike > 0 && rng() < 0.08) next += (rng() - 0.5) * spike
  return Math.max(min, Math.min(max, next))
}

function makeTelemetry(): TelemetryEvent {
  const now = Date.now()
  if (!sim) resetSim()
  const s = sim!

  s.speed = walk(s.speed, 6, 0, 45, 14)
  s.duty = walk(s.duty, 0.12, 0, 0.95, 0.4)
  s.motorCurrent = walk(s.motorCurrent, 14, -25, 70, 40)
  s.batteryCurrent = walk(s.batteryCurrent, 10, -45, 12, 25)
  s.batteryVoltage = walk(s.batteryVoltage, 0.25, 60, 84)
  s.batteryPercent = walk(s.batteryPercent, 0.15, 0, 100)
  s.tempMosfet = walk(s.tempMosfet, 0.4, 30, 72)
  s.tempMotor = walk(s.tempMotor, 0.35, 28, 66)
  s.pitch = walk(s.pitch, 5, -16, 16, 18)
  s.roll = walk(s.roll, 3, -12, 12, 10)

  return {
    hasFault: false,
    faultCode: 0,
    pitch: s.pitch,
    roll: s.roll,
    balancePitch: s.pitch * 0.6,
    balanceCurrent: s.motorCurrent * 0.1,
    speed: s.speed,
    batteryVoltage: s.batteryVoltage,
    batteryPercent: s.batteryPercent,
    motorCurrent: s.motorCurrent,
    batteryCurrent: s.batteryCurrent,
    erpm: s.speed * 190,
    dutyCycle: s.duty,
    state: 0,
    stateName: 'RUNNING',
    switchState: 0,
    adc1: 1.2,
    adc2: 1.1,
    odometer: 1234,
    tempMosfet: s.tempMosfet,
    tempMotor: s.tempMotor,
    avgLatency: 18,
    lastPacketAt: now,
  }
}

function getLiveState(): LiveStateEvent {
  const connected = connectedBoardId != null
  const connecting = connectingBoardId != null
  return {
    board: {
      phase: connecting ? 'connecting' : connected ? 'connected' : 'idle',
      selectedBoardId,
      connectedBoardId,
      bleId: connected || connecting ? E2E_BOARD_SCAN_RESULT.id : null,
      name: connected || connecting ? E2E_BOARD_SCAN_RESULT.name : null,
      connectionSeq,
      lastTelemetryAt: lastTelemetry?.lastPacketAt ?? null,
      recentTelemetry: lastTelemetry ? [lastTelemetry] : [],
      error: null,
      autoConnect: true,
    },
    gps: {
      phase: 'idle',
      latestFix: null,
      latestApproximateFix: null,
      latestPreciseFix: null,
      recentLocations: [],
      error: null,
    },
    scan: {
      phase: scanActive ? 'scanning' : 'idle',
      devices: scanActive ? [E2E_BOARD_SCAN_RESULT] : [],
      error: null,
    },
    recording: {
      enabled: false,
      activeBoardId: connected ? connectedBoardId : null,
      startedAt: null,
    },
  }
}

function emitLiveState(): void {
  const state = getLiveState()
  for (const listener of liveStateListeners) {
    listener(state)
  }
}

function clearTelemetryTimer(): void {
  if (!telemetryTimer) return
  clearInterval(telemetryTimer)
  telemetryTimer = null
}

function emitTelemetry(): void {
  if (!connectedBoardId) return
  lastTelemetry = makeTelemetry()
  for (const listener of telemetryListeners) {
    listener(lastTelemetry)
  }
  // NOTE: do not emit liveState per packet — its recentTelemetry reseeds (and
  // clears) the live history buffer, which would wipe accumulated samples on
  // every tick. liveState is emitted only on connection-state transitions.
}

// Seed a full window of past samples on connect so the sparklines render full
// of chaotic history immediately (instead of a slow right-edge crawl), and the
// charts get a representative point count to render.
const BACKFILL_WINDOW_MS = 5 * 60_000
const BACKFILL_STEP_MS = 100

function backfillTelemetry(): void {
  const now = Date.now()
  for (let ago = BACKFILL_WINDOW_MS; ago > 0; ago -= BACKFILL_STEP_MS) {
    const sample = makeTelemetry()
    sample.lastPacketAt = now - ago
    for (const listener of telemetryListeners) {
      listener(sample)
    }
  }
}

function startBoardSession(boardId: string): void {
  selectedBoardId = boardId
  connectingBoardId = boardId
  connectedBoardId = null
  lastTelemetry = null
  scanActive = false
  clearScanTimer()
  clearConnectTimer()
  clearTelemetryTimer()
  emitLiveState()
  connectTimer = setTimeout(() => {
    connectTimer = null
    connectedBoardId = boardId
    connectingBoardId = null
    connectionSeq += 1
    resetSim()
    // Announce "connected" once. lastTelemetry is still null here, so liveState
    // carries no recentTelemetry and won't clear the buffer we backfill next.
    emitLiveState()
    backfillTelemetry()
    emitTelemetry()
    telemetryTimer = setInterval(emitTelemetry, 50)
  }, 3000)
}

function stopBoardSession(): void {
  connectingBoardId = null
  connectedBoardId = null
  lastTelemetry = null
  clearConnectTimer()
  clearTelemetryTimer()
  emitLiveState()
}

export const e2eFake = {
  scan(): void {
    scanActive = true
    clearScanTimer()
    scanTimer = setTimeout(() => {
      scanTimer = null
      if (scanActive) emitDevice(E2E_BOARD_SCAN_RESULT)
    }, 300)
  },

  stopScan(): void {
    scanActive = false
    clearScanTimer()
  },

  selectBoard(boardId: string): void {
    startBoardSession(boardId)
  },

  stopBoard(): void {
    stopBoardSession()
  },

  probeBoardLink(_bleId: string): BoardProbeResult {
    stopBoardSession()
    for (const listener of boardProbeProgressListeners) {
      listener({ step: 'completed', elapsedMs: 0 })
    }
    return { outcome: 'resolved', candidates: [{ transport: 'direct', hasBms: false }] }
  },

  addBoardProbeProgressListener(cb: (event: BoardProbeProgressEvent) => void): EventSubscription {
    boardProbeProgressListeners.add(cb)
    return { remove: () => boardProbeProgressListeners.delete(cb) }
  },

  getLiveState(baseState: LiveStateEvent): LiveStateEvent {
    if (selectedBoardId || connectedBoardId || connectingBoardId) return getLiveState()
    return {
      ...baseState,
      scan: {
        ...baseState.scan,
        phase: scanActive ? 'scanning' : 'idle',
        devices: scanActive ? [E2E_BOARD_SCAN_RESULT] : [],
        error: null,
      },
    }
  },

  setSelectedBoard(boardId: string | null): void {
    selectedBoardId = boardId
    emitLiveState()
  },

  addDeviceListener(cb: (event: DeviceFoundEvent) => void): EventSubscription {
    deviceListeners.add(cb)
    return { remove: () => deviceListeners.delete(cb) }
  },

  addLiveStateListener(cb: (event: LiveStateEvent) => void): EventSubscription {
    liveStateListeners.add(cb)
    return { remove: () => liveStateListeners.delete(cb) }
  },

  addTelemetryListener(cb: (event: TelemetryEvent) => void): EventSubscription {
    telemetryListeners.add(cb)
    return { remove: () => telemetryListeners.delete(cb) }
  },

  getBoards(): Board[] {
    return [...e2eBoards]
  },

  upsertBoard(board: Board): void {
    const index = e2eBoards.findIndex((b) => b.id === board.id)
    if (index >= 0) {
      e2eBoards[index] = board
    } else {
      e2eBoards.push(board)
    }
  },

  getSettings(): AppSettings {
    return { ...e2eSettings }
  },

  updateSetting(key: string, value: unknown): void {
    ;(e2eSettings as unknown as Record<string, unknown>)[key] = value
  },

  seedE2EData(flow: string): void {
    if (flow === 'connect-board') {
      const boardId = 'e2e-board-1'
      const board: Board = {
        id: boardId,
        name: 'E2E Board',
        description: 'Seeded by Maestro',
        createdAt: Date.now(),
        batteryConfig: {
          mode: 'preset',
          cellPresetId: 'molicel:21700:p50b',
          seriesCount: 21,
          parallelCount: 2,
        },
        link: { bleId: 'E2:E2:E2:E2:E2:01', transport: 'direct' },
      }
      e2eBoards.length = 0
      e2eBoards.push(board)
      e2eSettings.selectedBoardId = boardId
      e2eSettings.autoConnect = false
    }
  },
}

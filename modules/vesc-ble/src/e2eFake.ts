import type { EventSubscription } from 'expo-modules-core'

import type {
  AppSettings,
  Board,
  BoardProbeProgressEvent,
  BoardProbeResult,
  DeviceFoundEvent,
  LiveSeriesEvent,
  LiveStateEvent,
  TelemetryEvent,
  TelemetryHistoryEvent,
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
const liveTickListeners = new Set<(event: TelemetryEvent) => void>()
const liveSeriesListeners = new Set<(event: LiveSeriesEvent) => void>()
const telemetryHistoryListeners = new Set<(event: TelemetryHistoryEvent) => void>()
const boardProbeProgressListeners = new Set<(event: BoardProbeProgressEvent) => void>()

const e2eBoards: Board[] = []

const e2eSettings: AppSettings = {
  liveHistoryLimit: 1000,
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
  telemetryPollRateHz: 20,
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

function makeTelemetry(): TelemetryEvent {
  const now = Date.now()
  const wobble = Math.sin(now / 1000)
  return {
    hasFault: false,
    faultCode: 0,
    pitch: wobble * 3,
    roll: wobble,
    balancePitch: wobble * 2,
    balanceCurrent: 0.6,
    speed: 12 + wobble,
    batteryVoltage: 75.6,
    batteryPercent: 75,
    motorCurrent: 8 + wobble,
    batteryCurrent: -3.4,
    erpm: 2400,
    dutyCycle: 0.18,
    state: 0,
    stateName: 'RUNNING',
    switchState: 0,
    adc1: 1.2,
    adc2: 1.1,
    odometer: 1234,
    tempMosfet: 36,
    tempMotor: 33,
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
      remoteTilt: null,
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
  for (const listener of liveTickListeners) {
    listener(lastTelemetry)
  }
  const batch: TelemetryHistoryEvent = { samples: [lastTelemetry] }
  for (const listener of telemetryHistoryListeners) {
    listener(batch)
  }
  emitLiveSeries(lastTelemetry)
  emitLiveState()
}

function emitLiveSeries(sample: TelemetryEvent): void {
  if (liveSeriesListeners.size === 0) return
  const ts = sample.lastPacketAt
  const point = (v: number | null | undefined): number[] =>
    v == null || !Number.isFinite(v) ? [] : [ts, v]
  const abs = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : Math.abs(v)
  const event: LiveSeriesEvent = {
    metrics: {
      motorTemp: sample.tempMotor != null && sample.tempMotor > 0 ? [ts, sample.tempMotor] : [],
      controllerTemp: point(sample.tempMosfet),
      motorCurrent: point(sample.motorCurrent),
      batteryCurrent: point(sample.batteryCurrent),
      batteryVoltage: point(sample.batteryVoltage),
      batteryPercent: point(sample.batteryPercent),
      speed: point(abs(sample.speed)),
      duty: point(abs(sample.dutyCycle) == null ? null : (abs(sample.dutyCycle) as number) * 100),
      // Detail-chart-only metrics (mirrors LIVE_SERIES_METRICS on native).
      pitch: point(sample.pitch),
      roll: point(sample.roll),
      balancePitch: point(sample.balancePitch),
      footpadAdc1: point(sample.adc1),
      footpadAdc2: point(sample.adc2),
    },
    generation: connectionSeq,
  }
  for (const listener of liveSeriesListeners) {
    listener(event)
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
    emitTelemetry()
    telemetryTimer = setInterval(emitTelemetry, 1000)
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

  addLiveTickListener(cb: (event: TelemetryEvent) => void): EventSubscription {
    liveTickListeners.add(cb)
    return { remove: () => liveTickListeners.delete(cb) }
  },

  addLiveSeriesListener(cb: (event: LiveSeriesEvent) => void): EventSubscription {
    liveSeriesListeners.add(cb)
    return { remove: () => liveSeriesListeners.delete(cb) }
  },

  addTelemetryHistoryListener(cb: (event: TelemetryHistoryEvent) => void): EventSubscription {
    telemetryHistoryListeners.add(cb)
    return { remove: () => telemetryHistoryListeners.delete(cb) }
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

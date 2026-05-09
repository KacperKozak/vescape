import { create } from 'zustand'
import type { EventSubscription } from 'expo-modules-core'
import {
  scan as nativeScan,
  stopScan as nativeStopScan,
  startLocationUpdates as nativeStartLocationUpdates,
  setTelemetryRecordingEnabled as nativeSetTelemetryRecordingEnabled,
  selectBoard as nativeSelectBoard,
  stopBoard as nativeStopBoard,
  setDebugRecordingEnabled as nativeSetDebugRecordingEnabled,
  getLiveState as nativeGetLiveState,
  setSelectedBoard as nativeSetSelectedBoard,
  addDeviceListener,
  addErrorListener,
  addLiveStateListener,
  addTelemetryListener,
  addLocationListener,
  addStopRequestedListener,
  type BoardPhase,
  type GpsPhase,
  type ScanStatus,
  type LocationEvent,
  type TelemetryEvent,
  type LiveStateEvent,
} from 'vesc-ble'

import { useSettingsStore } from '@/store/settingsStore'

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

export type BleStatus = BoardPhase

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
  recentTelemetry: TelemetryEvent[]
  recentLocations: LocationEvent[]
  telemetryRecordingEnabled: boolean
  recordDebugSession: boolean
}

interface BleActions {
  startScan: () => void
  stopScan: () => void
  connect: (boardId: string) => Promise<void>
  disconnect: () => Promise<void>
  setRecordDebugSession: (enabled: boolean) => void
  syncNativeState: () => void
  setSelectedBoard: (boardId: string | null) => void
  startTelemetryRecording: () => void
  stopTelemetryRecording: () => void
  startGpsTracking: (context?: { boardId?: string | null }) => void
}

type BleStore = BleState & BleActions
type BleSet = {
  (partial: Partial<BleStore> | ((state: BleStore) => Partial<BleStore>), replace?: false): void
}

let liveSub: EventSubscription | null = null
let telemetrySub: EventSubscription | null = null
let scanSub: EventSubscription | null = null
let scanErrorSub: EventSubscription | null = null
let stopRequestedSub: EventSubscription | null = null

const MAC_ADDRESS_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const MIN_LIVE_HISTORY_MINUTES = 1
const DEFAULT_LIVE_HISTORY_MINUTES = 5

function liveHistoryWindowMs(): number {
  const minutes = useSettingsStore.getState().liveHistoryLimit
  const safeMinutes =
    Number.isFinite(minutes) && minutes >= MIN_LIVE_HISTORY_MINUTES
      ? minutes
      : DEFAULT_LIVE_HISTORY_MINUTES
  return safeMinutes * 60 * 1000
}

function scannedDeviceName(id: string, name?: string): string {
  const candidate = name?.trim()
  if (candidate && !MAC_ADDRESS_RE.test(candidate)) return candidate
  return `Unknown ${id.slice(-5)}`
}

function telemetryKey(telemetry: TelemetryEvent): number {
  return telemetry.lastPacketAt
}

function locationKey(location: LocationEvent): number {
  return location.timestamp
}

function pruneByTimestamp<T>(items: T[], nowMs: number, key: (value: T) => number): T[] {
  const oldest = nowMs - liveHistoryWindowMs()
  return items.filter((value) => key(value) >= oldest)
}

function appendByTimestamp<T>(items: T[], item: T, key: (value: T) => number): T[] {
  const itemKey = key(item)
  if (items.some((existing) => key(existing) === itemKey)) return items
  return pruneByTimestamp([...items, item], itemKey, key).sort((a, b) => key(a) - key(b))
}

function applyLiveState(state: LiveStateEvent, set: BleSet): void {
  set((current) => ({
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
    recentTelemetry: state.board.recentTelemetry.length
      ? state.board.recentTelemetry
      : current.recentTelemetry,
    recentLocations: state.gps.recentLocations.length
      ? state.gps.recentLocations
      : current.recentLocations,
  }))
}

function installLiveSubscriptions(set: BleSet): void {
  if (!liveSub) {
    liveSub = addLiveStateListener((state) => applyLiveState(state, set))
  }
  if (!telemetrySub) {
    telemetrySub = addTelemetryListener((telemetry) => {
      const current = useBleStore.getState()
      if (telemetry.generation != null && telemetry.generation !== current.connectionSeq) return
      const recentTelemetry = appendByTimestamp(current.recentTelemetry, telemetry, telemetryKey)
      const recentLocations = telemetry.location
        ? appendByTimestamp(current.recentLocations, telemetry.location, locationKey)
        : current.recentLocations
      set({ recentTelemetry, recentLocations })
    })
  }
  if (!stopRequestedSub) {
    stopRequestedSub = addStopRequestedListener(() => {
      useBleStore.getState().syncNativeState()
    })
  }
}

export const useBleStore = create<BleState & BleActions>((set, get) => ({
  status: 'idle',
  gpsStatus: 'idle',
  scanStatus: 'idle',
  connectionSeq: 0,
  lastTelemetryAt: null,
  nativeStateReady: false,
  devices: [],
  selectedBoardId: null,
  connectedId: null,
  error: undefined,
  recentTelemetry: [],
  recentLocations: [],
  telemetryRecordingEnabled: false,
  recordDebugSession: false,

  startScan() {
    const currentStatus = get().status
    if (
      currentStatus === 'connecting' ||
      currentStatus === 'discovering' ||
      currentStatus === 'subscribing' ||
      currentStatus === 'waiting_for_telemetry' ||
      currentStatus === 'connected' ||
      currentStatus === 'stale' ||
      currentStatus === 'reconnecting' ||
      currentStatus === 'disconnecting'
    ) {
      return
    }

    set({ devices: [], error: undefined })

    scanSub?.remove()
    scanErrorSub?.remove()
    scanErrorSub = addErrorListener((event) => {
      set({ scanStatus: 'error', error: event.message })
    })
    scanSub = addDeviceListener((device) => {
      const name = scannedDeviceName(device.id, device.name)
      const rssi = device.rssi ?? -99

      set((state) => {
        const existing = state.devices.findIndex((d) => d.id === device.id)
        if (existing !== -1) {
          const updated = [...state.devices]
          updated[existing] = { id: device.id, name, rssi }
          return { devices: updated }
        }
        return { devices: [...state.devices, { id: device.id, name, rssi }] }
      })
    })

    try {
      nativeScan()
      get().syncNativeState()
    } catch (err) {
      scanSub?.remove()
      scanSub = null
      scanErrorSub?.remove()
      scanErrorSub = null
      set({
        scanStatus: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  stopScan() {
    try {
      nativeStopScan()
      get().syncNativeState()
    } catch {
      // Native scan may already be stopped after permission or lifecycle changes.
    }
    scanSub?.remove()
    scanSub = null
    scanErrorSub?.remove()
    scanErrorSub = null
  },

  async connect(boardId: string) {
    get().stopScan()
    nativeSetSelectedBoard(boardId)
    try {
      await nativeSelectBoard(boardId)
    } catch {
      get().syncNativeState()
    }
  },

  async disconnect() {
    try {
      await nativeStopBoard()
    } catch {
      // Native may already be stopped.
    } finally {
      get().syncNativeState()
    }
  },

  setRecordDebugSession(enabled: boolean) {
    set({ recordDebugSession: enabled })
    nativeSetDebugRecordingEnabled(enabled)
  },

  syncNativeState() {
    installLiveSubscriptions(set)
    const state = nativeGetLiveState()
    applyLiveState(state, set)
  },

  setSelectedBoard(boardId: string | null) {
    nativeSetSelectedBoard(boardId)
    get().syncNativeState()
  },

  startTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(true)
    get().syncNativeState()
  },

  stopTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(false)
    get().syncNativeState()
  },

  startGpsTracking(context) {
    nativeStartLocationUpdates({
      boardId: context?.boardId ?? null,
    })
    get().syncNativeState()
  },
}))

addLocationListener((location) => {
  useBleStore.setState((s) => ({
    recentLocations: appendByTimestamp(s.recentLocations, location, locationKey),
  }))
})

useSettingsStore.subscribe((settings, previousSettings) => {
  if (settings.liveHistoryLimit === previousSettings.liveHistoryLimit) return
  const nowMs = Date.now()
  useBleStore.setState((s) => ({
    recentTelemetry: pruneByTimestamp(s.recentTelemetry, nowMs, telemetryKey),
    recentLocations: pruneByTimestamp(s.recentLocations, nowMs, locationKey),
  }))
})

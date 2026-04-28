import { create } from 'zustand'
import type { EventSubscription } from 'expo-modules-core'
import {
  scan as nativeScan,
  stopScan as nativeStopScan,
  startSession,
  stopSession,
  listRecordings as nativeListRecordings,
  deleteRecording as nativeDeleteRecording,
  exportRecording as nativeExportRecording,
  addDeviceListener,
  addSessionStateListener,
  addTelemetryListener,
  addLocationListener,
  type RecordingInfo,
  type SessionMode,
  type LocationEvent,
} from 'vesc-ble'
import { type RefloatValues } from '../vesc/types'

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

export type { RecordingInfo }
export type { SessionMode }

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error'
export type GpsFix = LocationEvent

interface BleState {
  status: BleStatus
  sessionMode: SessionMode | null
  devices: ScannedDevice[]
  connectedId: string | null
  refloatValues: RefloatValues | null
  error: string | undefined
  /** Total BLE notification packets received — useful for diagnosing no-data issues */
  rxCount: number
  /** Timestamp (ms) of the last successfully parsed refloat packet */
  lastPacketAt: number | null
  /** Rolling average round-trip time in ms (poll sent → response received) */
  avgLatency: number | null
  gpsFix: GpsFix | null
  recordDebugSession: boolean
  recordings: RecordingInfo[]
}

interface BleActions {
  startScan: () => void
  stopScan: () => void
  connect: (id: string, name?: string) => Promise<void>
  replayRecording: (recording: RecordingInfo) => Promise<void>
  disconnect: () => Promise<void>
  setRecordDebugSession: (enabled: boolean) => void
  loadRecordings: () => Promise<void>
  deleteRecording: (recording: RecordingInfo) => Promise<void>
  exportRecording: (recording: RecordingInfo) => Promise<string>
}

// ---------------------------------------------------------------------------
// Native session subscriptions
// ---------------------------------------------------------------------------

let telemetrySub: EventSubscription | null = null
let sessionSub: EventSubscription | null = null
let locationSub: EventSubscription | null = null
let scanSub: EventSubscription | null = null
const DEFAULT_BOARD_NAME = 'VESC Board'
const MAC_ADDRESS_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i

function removeSessionSubscriptions(): void {
  telemetrySub?.remove()
  telemetrySub = null
  sessionSub?.remove()
  sessionSub = null
  locationSub?.remove()
  locationSub = null
}

function friendlyDeviceName(id: string, name?: string): string {
  const candidate = name?.trim()
  if (candidate && !MAC_ADDRESS_RE.test(candidate)) return candidate
  return DEFAULT_BOARD_NAME
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBleStore = create<BleState & BleActions>((set, get) => ({
  // ---- state ----
  status: 'idle',
  sessionMode: null,
  devices: [],
  connectedId: null,
  refloatValues: null,
  error: undefined,
  rxCount: 0,
  lastPacketAt: null,
  avgLatency: null,
  gpsFix: null,
  recordDebugSession: false,
  recordings: [],

  // ---- actions ----

  startScan() {
    set({ status: 'scanning', devices: [], error: undefined })

    scanSub?.remove()
    scanSub = addDeviceListener((device) => {
      const name = device.name || DEFAULT_BOARD_NAME
      const rssi = device.rssi ?? -99

      set((state) => {
        // Deduplicate by id, update RSSI if already present
        const existing = state.devices.findIndex((d) => d.id === device.id)
        if (existing !== -1) {
          const updated = [...state.devices]
          updated[existing] = { id: device.id, name, rssi }
          return { devices: updated }
        }
        return { devices: [...state.devices, { id: device.id, name, rssi }] }
      })
    })
    nativeScan()
  },

  stopScan() {
    nativeStopScan()
    scanSub?.remove()
    scanSub = null
    set((state) => ({
      status: state.status === 'scanning' ? 'idle' : state.status,
    }))
  },

  async connect(id: string, name?: string) {
    const { stopScan } = get()
    stopScan()
    set({
      status: 'connecting',
      sessionMode: 'ble',
      connectedId: null,
      refloatValues: null,
      gpsFix: null,
      error: undefined,
      lastPacketAt: null,
      avgLatency: null,
    })

    removeSessionSubscriptions()
    locationSub = addLocationListener((location) => {
      set({ gpsFix: location })
    })
    telemetrySub = addTelemetryListener((telemetry) => {
      const {
        avgLatency,
        lastPacketAt,
        stateName: _stateName,
        location,
        ...refloatValues
      } = telemetry
      set((s) => ({
        refloatValues: refloatValues as RefloatValues,
        gpsFix: location ?? null,
        lastPacketAt,
        avgLatency,
        rxCount: s.rxCount + 1,
      }))
    })
    sessionSub = addSessionStateListener((session) => {
      set({
        status: session.status === 'error' ? 'error' : session.status,
        sessionMode: session.mode,
        connectedId: session.deviceId,
        error: session.error ?? undefined,
      })
    })

    const device = get().devices.find((d) => d.id === id)
    const deviceName = friendlyDeviceName(id, name ?? device?.name)

    try {
      await startSession({
        mode: 'ble',
        deviceId: id,
        deviceName,
        pollIntervalMs: 500,
        recordingEnabled: get().recordDebugSession,
      })
      set({ status: 'connected', sessionMode: 'ble', connectedId: id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', sessionMode: 'ble', error: msg })
    }
  },

  async replayRecording(recording: RecordingInfo) {
    const { stopScan } = get()
    stopScan()
    set({
      status: 'connecting',
      sessionMode: 'replay',
      connectedId: recording.path,
      refloatValues: null,
      gpsFix: null,
      error: undefined,
      lastPacketAt: null,
      avgLatency: null,
    })

    removeSessionSubscriptions()
    locationSub = addLocationListener((location) => {
      set({ gpsFix: location })
    })
    telemetrySub = addTelemetryListener((telemetry) => {
      const {
        avgLatency,
        lastPacketAt,
        stateName: _stateName,
        location,
        ...refloatValues
      } = telemetry
      set((s) => ({
        refloatValues: refloatValues as RefloatValues,
        gpsFix: location ?? null,
        lastPacketAt,
        avgLatency,
        rxCount: s.rxCount + 1,
      }))
    })
    sessionSub = addSessionStateListener((session) => {
      set({
        status: session.status === 'error' ? 'error' : session.status,
        sessionMode: session.mode ?? 'replay',
        connectedId: session.deviceId ?? recording.path,
        error: session.error ?? undefined,
      })
    })

    try {
      await startSession({
        mode: 'replay',
        deviceName: recording.deviceName,
        recordingPath: recording.path,
        pollIntervalMs: 500,
      })
      set({ status: 'connected', sessionMode: 'replay', connectedId: recording.path })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', sessionMode: 'replay', error: msg })
    }
  },

  async disconnect() {
    await stopSession()
    removeSessionSubscriptions()
    await get().loadRecordings()
    set({
      status: 'idle',
      sessionMode: null,
      connectedId: null,
      refloatValues: null,
      gpsFix: null,
      error: undefined,
      rxCount: 0,
      lastPacketAt: null,
      avgLatency: null,
    })
  },

  setRecordDebugSession(enabled: boolean) {
    set({ recordDebugSession: enabled })
  },

  async loadRecordings() {
    const recordings = await nativeListRecordings()
    set({ recordings })
  },

  async deleteRecording(recording: RecordingInfo) {
    await nativeDeleteRecording(recording.path)
    await get().loadRecordings()
  },

  async exportRecording(recording: RecordingInfo) {
    return nativeExportRecording(recording.path)
  },
}))

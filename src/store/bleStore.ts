import { create } from 'zustand'
import type { EventSubscription } from 'expo-modules-core'
import {
  scan as nativeScan,
  stopScan as nativeStopScan,
  startLocationUpdates as nativeStartLocationUpdates,
  stopLocationUpdates as nativeStopLocationUpdates,
  setTelemetryRecordingEnabled as nativeSetTelemetryRecordingEnabled,
  startSession,
  stopSession,
  listRecordings as nativeListRecordings,
  deleteRecording as nativeDeleteRecording,
  exportRecording as nativeExportRecording,
  addDeviceListener,
  addSessionStateListener,
  addTelemetryListener,
  addLocationListener,
  addStopRequestedListener,
  type RecordingInfo,
  type SessionMode,
  type LocationEvent,
  type TelemetryEvent,
} from 'vesc-ble'
import { type RefloatValues } from '../vesc/types'
import { recordLivePoint, type LiveDataBucket } from './liveMonitor'
import {
  shouldResumeGpsMonitoringAfterDisconnect,
  shouldStopNativeSessionOnDisconnect,
} from './monitoring'

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
  liveDataBuckets: LiveDataBucket[]
  liveLastPointAtMs: number | null
  telemetryRecordingEnabled: boolean
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
  startTelemetryRecording: (context?: {
    deviceId?: string | null
    deviceName?: string | null
  }) => void
  stopTelemetryRecording: () => void
  startGpsTracking: (context?: { deviceId?: string | null; deviceName?: string | null }) => void
  stopGpsTracking: () => void
}

type BleStore = BleState & BleActions
type BleSet = {
  (partial: Partial<BleStore> | ((state: BleStore) => Partial<BleStore>), replace?: false): void
}

// ---------------------------------------------------------------------------
// Native session subscriptions
// ---------------------------------------------------------------------------

let telemetrySub: EventSubscription | null = null
let sessionSub: EventSubscription | null = null
let gpsSub: EventSubscription | null = null
let scanSub: EventSubscription | null = null
let stopRequestedSub: EventSubscription | null = null
let gpsTrackingContext: { deviceId?: string | null; deviceName?: string | null } | undefined
const DEFAULT_BOARD_NAME = 'VESC Board'
const MAC_ADDRESS_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i

function removeSessionSubscriptions(): void {
  telemetrySub?.remove()
  telemetrySub = null
  sessionSub?.remove()
  sessionSub = null
}

function friendlyDeviceName(id: string, name?: string): string {
  const candidate = name?.trim()
  if (candidate && !MAC_ADDRESS_RE.test(candidate)) return candidate
  return DEFAULT_BOARD_NAME
}

function telemetryToRefloatValues(telemetry: TelemetryEvent): Partial<BleState> {
  const { avgLatency, lastPacketAt, stateName: _stateName, location, ...refloatValues } = telemetry
  return {
    refloatValues: refloatValues as RefloatValues,
    ...(location ? { gpsFix: location } : {}),
    lastPacketAt,
    avgLatency,
  }
}

function installSessionSubscriptions(
  set: BleSet,
  fallbackMode: SessionMode,
  fallbackDeviceId: string,
): void {
  removeSessionSubscriptions()
  telemetrySub = addTelemetryListener((telemetry) => {
    const receivedAtMs = Date.now()
    set((s) => ({
      ...telemetryToRefloatValues(telemetry),
      rxCount: s.rxCount + 1,
      liveDataBuckets: recordLivePoint(s.liveDataBuckets, 'board', receivedAtMs),
      liveLastPointAtMs: receivedAtMs,
    }))
  })
  sessionSub = addSessionStateListener((session) => {
    set({
      status: session.status === 'error' ? 'error' : session.status,
      sessionMode: session.mode ?? fallbackMode,
      connectedId: session.deviceId ?? fallbackDeviceId,
      error: session.error ?? undefined,
    })
  })
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
  liveDataBuckets: [],
  liveLastPointAtMs: null,
  telemetryRecordingEnabled: false,
  recordDebugSession: false,
  recordings: [],

  // ---- actions ----

  startScan() {
    const currentStatus = get().status
    if (currentStatus === 'connecting' || currentStatus === 'connected') {
      return
    }

    set({ status: 'scanning', devices: [], error: undefined })

    scanSub?.remove()
    scanSub = addDeviceListener((device) => {
      const name = device.name || DEFAULT_BOARD_NAME
      const rssi = device.rssi ?? -99

      set((state) => {
        const existing = state.devices.findIndex((d) => d.id === device.id)
        if (existing !== -1) {
          const updated = [...state.devices]
          updated[existing] = { id: device.id, name, rssi }
          updated.sort((a, b) => b.rssi - a.rssi)
          return { devices: updated }
        }
        return {
          devices: [...state.devices, { id: device.id, name, rssi }].sort(
            (a, b) => b.rssi - a.rssi,
          ),
        }
      })
    })
    try {
      nativeScan()
    } catch (err) {
      scanSub?.remove()
      scanSub = null
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  stopScan() {
    try {
      nativeStopScan()
    } catch {
      // Native scan may already be stopped after permission or lifecycle changes.
    }
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
      error: undefined,
      lastPacketAt: null,
      avgLatency: null,
    })

    installSessionSubscriptions(set, 'ble', id)
    stopRequestedSub?.remove()
    stopRequestedSub = addStopRequestedListener(() => {
      removeSessionSubscriptions()
      void get().loadRecordings()
      set({
        status: 'idle',
        sessionMode: null,
        connectedId: null,
        refloatValues: null,
        error: undefined,
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
        telemetryRecordingEnabled: get().telemetryRecordingEnabled,
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
      error: undefined,
      lastPacketAt: null,
      avgLatency: null,
    })

    installSessionSubscriptions(set, 'replay', recording.path)

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
    const sessionMode = get().sessionMode
    const shouldStopNativeSession = shouldStopNativeSessionOnDisconnect(sessionMode)
    const shouldResumeGps = shouldResumeGpsMonitoringAfterDisconnect(sessionMode)
    try {
      if (shouldStopNativeSession) {
        await stopSession()
      }
    } catch {
      // Treat native "already stopped" style failures as a completed local teardown.
    } finally {
      removeSessionSubscriptions()
      stopRequestedSub?.remove()
      stopRequestedSub = null
      await get().loadRecordings()
      set({
        status: 'idle',
        sessionMode: null,
        connectedId: null,
        refloatValues: null,
        error: undefined,
        rxCount: 0,
        lastPacketAt: null,
        avgLatency: null,
      })
      if (shouldResumeGps) {
        get().startGpsTracking(gpsTrackingContext)
      }
    }
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

  startTelemetryRecording(context) {
    set({ telemetryRecordingEnabled: true })
    nativeSetTelemetryRecordingEnabled(true)
    get().startGpsTracking(context)
  },

  stopTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(false)
    set({ telemetryRecordingEnabled: false })
  },

  startGpsTracking(context) {
    gpsTrackingContext = context
    if (!gpsSub) {
      gpsSub = addLocationListener((location) => {
        const receivedAtMs = Date.now()
        set((s) => ({
          gpsFix: location,
          liveDataBuckets: recordLivePoint(s.liveDataBuckets, 'gps', receivedAtMs),
          liveLastPointAtMs: receivedAtMs,
        }))
      })
    }
    nativeStartLocationUpdates({
      deviceId: context?.deviceId ?? null,
      deviceName: context?.deviceName ?? null,
    })
  },

  stopGpsTracking() {
    gpsTrackingContext = undefined
    nativeStopLocationUpdates()
    gpsSub?.remove()
    gpsSub = null
    set({ gpsFix: null })
  },
}))

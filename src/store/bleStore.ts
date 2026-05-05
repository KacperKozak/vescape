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
  getSessionState as nativeGetSessionState,
  startSession,
  listRecordings as nativeListRecordings,
  deleteRecording as nativeDeleteRecording,
  exportRecording as nativeExportRecording,
  addDeviceListener,
  addErrorListener,
  addSessionStateListener,
  addTelemetryListener,
  addLocationListener,
  addStopRequestedListener,
  type RecordingInfo,
  type SessionMode,
  type SessionStateEvent,
  type BoardStatus,
  type ScanStatus,
  type LocationEvent,
  type TelemetryEvent,
} from 'vesc-ble'

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

export type { RecordingInfo }
export type { SessionMode }

export type BleStatus = BoardStatus

interface BleState {
  status: BleStatus
  sessionMode: SessionMode | null
  gpsStatus: 'idle' | 'active'
  scanStatus: ScanStatus
  generation: number
  lastTelemetryAt: number | null
  nativeStateReady: boolean
  devices: ScannedDevice[]
  connectedId: string | null
  error: string | undefined
  recentTelemetry: TelemetryEvent[]
  recentLocations: LocationEvent[]
  telemetryRecordingEnabled: boolean
  recordDebugSession: boolean
  recordings: RecordingInfo[]
}

interface BleActions {
  startScan: () => void
  stopScan: () => void
  connect: (boardId: string) => Promise<void>
  replayRecording: (recording: RecordingInfo) => Promise<void>
  disconnect: () => Promise<void>
  setRecordDebugSession: (enabled: boolean) => void
  loadRecordings: () => Promise<void>
  deleteRecording: (recording: RecordingInfo) => Promise<void>
  exportRecording: (recording: RecordingInfo) => Promise<string>
  syncNativeState: () => void
  startTelemetryRecording: () => void
  stopTelemetryRecording: () => void
  startGpsTracking: (context?: { boardId?: string | null }) => void
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
let scanSub: EventSubscription | null = null
let scanErrorSub: EventSubscription | null = null
let stopRequestedSub: EventSubscription | null = null
const MAC_ADDRESS_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const RECENT_WINDOW_MS = 10 * 60 * 1000

function removeSessionSubscriptions(): void {
  telemetrySub?.remove()
  telemetrySub = null
  sessionSub?.remove()
  sessionSub = null
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

function appendByTimestamp<T>(items: T[], item: T, key: (value: T) => number): T[] {
  const itemKey = key(item)
  if (items.some((existing) => key(existing) === itemKey)) return items
  const oldest = itemKey - RECENT_WINDOW_MS
  return [...items, item].filter((value) => key(value) >= oldest).sort((a, b) => key(a) - key(b))
}

function isBoardMode(mode: SessionMode | null | undefined): boolean {
  return mode === 'ble' || mode === 'replay'
}

function boardStatusFromSession(session: SessionStateEvent): BleStatus {
  if (session.boardStatus) return session.boardStatus
  if (!isBoardMode(session.mode)) return 'idle'
  return session.status as BleStatus
}

function boardConnectedIdFromSession(
  session: SessionStateEvent,
  fallbackDeviceId: string,
): string | null {
  if (!isBoardMode(session.mode)) return null
  return session.deviceId ?? fallbackDeviceId
}

function installSessionSubscriptions(
  set: BleSet,
  fallbackMode: SessionMode,
  fallbackDeviceId: string,
): void {
  removeSessionSubscriptions()
  telemetrySub = addTelemetryListener((telemetry) => {
    const current = useBleStore.getState()
    if (telemetry.generation != null && telemetry.generation !== current.generation) return
    const recentTelemetry = appendByTimestamp(current.recentTelemetry, telemetry, telemetryKey)
    const recentLocations = telemetry.location
      ? appendByTimestamp(current.recentLocations, telemetry.location, locationKey)
      : current.recentLocations
    set({
      recentTelemetry,
      recentLocations,
    })
  })
  sessionSub = addSessionStateListener((session) => {
    const boardStatus = boardStatusFromSession(session)
    set((s) => {
      const hasRecentTelemetry = session.recentTelemetry != null
      const hasRecentLocations = session.recentLocations != null
      const shouldClearTelemetry = boardStatus === 'idle' || boardStatus === 'connecting'

      return {
        status: boardStatus,
        sessionMode: session.mode ?? fallbackMode,
        gpsStatus: session.gpsStatus ?? 'idle',
        scanStatus: session.scanStatus ?? s.scanStatus,
        generation: session.generation ?? s.generation,
        lastTelemetryAt: session.lastTelemetryAt ?? null,
        nativeStateReady: true,
        connectedId: boardConnectedIdFromSession(session, fallbackDeviceId),
        error: session.error ?? undefined,
        telemetryRecordingEnabled: session.telemetryRecordingEnabled ?? false,
        recentTelemetry: hasRecentTelemetry
          ? session.recentTelemetry!
          : shouldClearTelemetry
            ? []
            : s.recentTelemetry,
        recentLocations: hasRecentLocations ? session.recentLocations! : s.recentLocations,
      }
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
  gpsStatus: 'idle',
  scanStatus: 'idle',
  generation: 0,
  lastTelemetryAt: null,
  nativeStateReady: false,
  devices: [],
  connectedId: null,
  error: undefined,
  recentTelemetry: [],
  recentLocations: [],
  telemetryRecordingEnabled: false,
  recordDebugSession: false,
  recordings: [],

  // ---- actions ----

  startScan() {
    const currentStatus = get().status
    if (
      currentStatus === 'connecting' ||
      currentStatus === 'connected' ||
      currentStatus === 'stale' ||
      currentStatus === 'reconnecting'
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
        return {
          devices: [...state.devices, { id: device.id, name, rssi }],
        }
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
    set({ error: undefined })

    installSessionSubscriptions(set, 'ble', boardId)
    stopRequestedSub?.remove()
    stopRequestedSub = addStopRequestedListener(() => {
      removeSessionSubscriptions()
      void get().loadRecordings()
      get().syncNativeState()
    })

    try {
      await nativeSelectBoard(boardId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', sessionMode: 'ble', error: msg })
    }
  },

  async replayRecording(recording: RecordingInfo) {
    const { stopScan } = get()
    stopScan()
    set({ connectedId: null, error: undefined, recentTelemetry: [] })

    installSessionSubscriptions(set, 'replay', recording.path)

    try {
      await startSession({
        mode: 'replay',
        deviceName: recording.deviceName,
        recordingPath: recording.path,
        pollIntervalMs: 500,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', sessionMode: 'replay', error: msg })
    }
  },

  async disconnect() {
    // Remove subscriptions BEFORE the native call so intermediate session-state
    // events emitted during teardown don't flicker status through multiple values.
    removeSessionSubscriptions()
    stopRequestedSub?.remove()
    stopRequestedSub = null

    try {
      await nativeStopBoard()
    } catch {
      // Treat native "already stopped" style failures as a completed local teardown.
    } finally {
      await get().loadRecordings()
      get().syncNativeState()
    }
  },

  setRecordDebugSession(enabled: boolean) {
    set({ recordDebugSession: enabled })
    nativeSetDebugRecordingEnabled(enabled)
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

  syncNativeState() {
    const session = nativeGetSessionState()
    const boardStatus = boardStatusFromSession(session)
    if (session.mode && boardStatus !== 'idle') {
      installSessionSubscriptions(set, session.mode, session.deviceId ?? '')
    } else {
      removeSessionSubscriptions()
    }
    set({
      status: boardStatus,
      sessionMode: session.mode,
      gpsStatus: session.gpsStatus ?? 'idle',
      scanStatus: session.scanStatus ?? 'idle',
      generation: session.generation ?? 0,
      lastTelemetryAt: session.lastTelemetryAt ?? null,
      connectedId: boardConnectedIdFromSession(session, ''),
      error: session.error ?? undefined,
      telemetryRecordingEnabled: session.telemetryRecordingEnabled ?? false,
      recentTelemetry: session.recentTelemetry ?? [],
      recentLocations: session.recentLocations ?? [],
      nativeStateReady: true,
    })
  },

  startTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(true)
  },

  stopTelemetryRecording() {
    nativeSetTelemetryRecordingEnabled(false)
  },

  // Updates the device context used by the native GPS session (for record tagging).
  // GPS is always running — this just tells native which board to attribute locations to.
  startGpsTracking(context) {
    nativeStartLocationUpdates({
      boardId: context?.boardId ?? null,
    })
  },
}))

// GPS listener is always active for the lifetime of the store — no start/stop.
// The native layer starts GPS automatically with every BLE session (beginSession)
// and auto-resumes standalone GPS monitoring after disconnect (consumePendingStop).
addLocationListener((location) => {
  useBleStore.setState((s) => ({
    recentLocations: appendByTimestamp(s.recentLocations, location, locationKey),
  }))
})

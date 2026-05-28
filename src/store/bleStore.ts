import { create } from 'zustand'
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
  type BoardPhase,
  type GpsPhase,
  type ScanStatus,
  type LocationEvent,
  type LiveStateEvent,
} from 'vesc-ble'

import { useSettingsStore } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { type LiveStatusSummary } from '@/lib/telemetry/liveMetricHistory'

interface EventSubscription {
  remove(): void
}

export interface ScannedDevice {
  id: string
  name: string
  rssi: number
}

type BleStatus = BoardPhase

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
  liveLocationHistory: LocationEvent[]
  latestApproximateLocation: LocationEvent | null
  liveStatus: LiveStatusSummary
  metricVersion: number
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
  startGpsTracking: () => void
}

type BleStore = BleState & BleActions
type BleSet = {
  (partial: Partial<BleStore> | ((state: BleStore) => Partial<BleStore>), replace?: false): void
}

let liveSub: EventSubscription | null = null
let telemetrySub: EventSubscription | null = null
let locationSub: EventSubscription | null = null
let scanSub: EventSubscription | null = null
let scanErrorSub: EventSubscription | null = null
let liveHistoryPublishTimer: ReturnType<typeof setTimeout> | null = null
let settingsUnsubscribe: (() => void) | null = null

const MAC_ADDRESS_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const LIVE_HISTORY_PUBLISH_MS = 1000

function scannedDeviceName(id: string, name?: string): string {
  const candidate = name?.trim()
  if (candidate && !MAC_ADDRESS_RE.test(candidate)) return candidate
  return `Unknown ${id.slice(-5)}`
}

const EMPTY_LIVE_STATUS: LiveStatusSummary = {
  boardSampleCount: 0,
  boardLastPacketAt: null,
  boardAvgLatencyMs: null,
  gpsSampleCount: 0,
  gpsLastFixAt: null,
  gpsPrecise: false,
  gpsAccuracyM: null,
}

function clearLiveHistoryPublishTimer(): void {
  if (!liveHistoryPublishTimer) return
  clearTimeout(liveHistoryPublishTimer)
  liveHistoryPublishTimer = null
}

function removeLiveSubscriptions(): void {
  clearLiveHistoryPublishTimer()
  liveSub?.remove()
  telemetrySub?.remove()
  locationSub?.remove()
  liveSub = null
  telemetrySub = null
  locationSub = null
}

function removeScanSubscriptions(): void {
  scanSub?.remove()
  scanErrorSub?.remove()
  scanSub = null
  scanErrorSub = null
}

function cleanupBleStoreModule(): void {
  removeLiveSubscriptions()
  removeScanSubscriptions()
  settingsUnsubscribe?.()
  settingsUnsubscribe = null
}

function applyLiveState(state: LiveStateEvent, set: BleSet): void {
  const hasRecentSamples =
    state.board.recentTelemetry.length > 0 || state.gps.recentLocations.length > 0
  if (hasRecentSamples) {
    clearLiveHistoryPublishTimer()
  }
  if (!hasRecentSamples) {
    liveTelemetryRuntime.syncConnectionSeq(state.board.connectionSeq)
  }
  const live = hasRecentSamples
    ? liveTelemetryRuntime.seedFromLiveState(state)
    : liveTelemetryRuntime.getSnapshot()

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
    ...(hasRecentSamples
      ? {
          liveLocationHistory: live.liveLocationHistory,
          latestApproximateLocation: live.latestApproximateLocation,
          liveStatus: live.liveStatus,
          metricVersion: liveTelemetryRuntime.getVersion(),
        }
      : {}),
  })
}

function resetLivePresentation(set: BleSet): void {
  clearLiveHistoryPublishTimer()
  const live = liveTelemetryRuntime.reset()
  set({
    lastTelemetryAt: null,
    liveLocationHistory: live.liveLocationHistory,
    latestApproximateLocation: live.latestApproximateLocation,
    liveStatus: live.liveStatus,
    metricVersion: liveTelemetryRuntime.getVersion(),
  })
}

function scheduleLiveHistoryPublish(set: BleSet): void {
  if (liveHistoryPublishTimer) return
  liveHistoryPublishTimer = setTimeout(() => {
    liveHistoryPublishTimer = null
    const live = liveTelemetryRuntime.consumePendingSnapshot()
    if (!live) return
    set({
      liveLocationHistory: live.liveLocationHistory,
      latestApproximateLocation: live.latestApproximateLocation,
      liveStatus: live.liveStatus,
      metricVersion: liveTelemetryRuntime.getVersion(),
    })
  }, LIVE_HISTORY_PUBLISH_MS)
}

function installLiveSubscriptions(set: BleSet): void {
  if (!liveSub) {
    liveSub = addLiveStateListener((state) => applyLiveState(state, set))
  }
  if (!telemetrySub) {
    telemetrySub = addTelemetryListener((telemetry) => {
      const accepted = liveTelemetryRuntime.ingestTelemetry(telemetry)
      if (!accepted) return
      set({
        lastTelemetryAt: telemetry.lastPacketAt,
      })
      scheduleLiveHistoryPublish(set)
    })
  }
  if (!locationSub) {
    locationSub = addLocationListener((location) => {
      liveTelemetryRuntime.ingestLocation(location)
      scheduleLiveHistoryPublish(set)
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
  liveLocationHistory: [],
  latestApproximateLocation: null,
  liveStatus: EMPTY_LIVE_STATUS,
  metricVersion: 0,
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
      currentStatus === 'rescanning' ||
      currentStatus === 'disconnecting'
    ) {
      return
    }

    set({ devices: [], error: undefined })

    removeScanSubscriptions()
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
      removeScanSubscriptions()
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
    removeScanSubscriptions()
  },

  async connect(boardId: string) {
    get().stopScan()
    resetLivePresentation(set)
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
      resetLivePresentation(set)
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

  startGpsTracking() {
    nativeStartLocationUpdates()
    get().syncNativeState()
  },
}))

type HotModule = {
  hot?: {
    dispose?: (callback: () => void) => void
  }
}

type BleStoreGlobal = typeof globalThis & {
  __vescBleStoreCleanup?: () => void
}

const bleStoreGlobal = globalThis as BleStoreGlobal
bleStoreGlobal.__vescBleStoreCleanup?.()

settingsUnsubscribe = useSettingsStore.subscribe((settings, previousSettings) => {
  if (settings.liveHistoryLimit === previousSettings.liveHistoryLimit) return
  const state = nativeGetLiveState()
  applyLiveState(state, useBleStore.setState)
})

bleStoreGlobal.__vescBleStoreCleanup = cleanupBleStoreModule

const hotModule = typeof module === 'undefined' ? null : (module as unknown as HotModule)
hotModule?.hot?.dispose?.(cleanupBleStoreModule)

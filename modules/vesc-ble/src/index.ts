import { requireNativeModule, type EventSubscription } from 'expo-modules-core'

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface DeviceFoundEvent {
  id: string
  name: string
  rssi: number
  serviceUUIDs: string[]
}

export interface ErrorEvent {
  message: string
}

export interface LocationEvent {
  latitude: number
  longitude: number
  speedMps: number | null
  bearingDeg: number | null
  accuracyM: number | null
  altitudeM: number | null
  timestamp: number
  precise: boolean
  saved: boolean
}

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type SessionMode = 'ble' | 'replay' | 'gps'

export interface TelemetryEvent {
  location?: LocationEvent | null
  hasFault: boolean
  faultCode: number
  pitch: number
  roll: number
  balancePitch: number
  balanceCurrent: number
  speed: number
  batteryVoltage: number
  motorCurrent: number
  batteryCurrent: number
  erpm: number
  dutyCycle: number
  state: number
  stateName: string
  switchState: number
  adc1: number
  adc2: number
  odometer: number | null
  tempMosfet: number | null
  tempMotor: number | null
  avgLatency: number | null
  lastPacketAt: number
}

export interface SessionStateEvent {
  status: SessionStatus
  mode: SessionMode | null
  deviceId: string | null
  deviceName: string | null
  canId: number | null
  error: string | null
  autoReconnect?: boolean
  telemetryRecordingEnabled?: boolean
  recentTelemetry?: TelemetryEvent[]
  recentLocations?: LocationEvent[]
}

export type StartSessionOptions =
  | {
      mode: 'ble'
      deviceId: string
      deviceName: string
      canId?: number
      pollIntervalMs?: number
      recordingEnabled?: boolean
      telemetryRecordingEnabled?: boolean
      autoReconnect?: boolean
    }
  | {
      mode: 'replay'
      deviceName?: string
      recordingPath: string
      pollIntervalMs?: number
    }

export interface RecordingInfo {
  id: string
  path: string
  fileName: string
  deviceName: string
  startedAt: number
  sizeBytes: number
}

export interface TelemetryHistoryOptions {
  fromMs?: number
  toMs?: number
  deviceId?: string
  limit?: number
  cursorBeforeMs?: number
}

export interface TelemetryHistoryBlock {
  id: string
  startAtMs: number
  endAtMs: number
  bucketStartMs: number
  deviceId: string | null
  deviceName: string
  sampleCount: number
  gpsPointCount: number
  preciseGpsPointCount: number
  maxAbsSpeedKmh: number
  maxGpsSpeedKmh: number | null
  avgAbsSpeedKmh: number
  minBatteryVoltage: number | null
  maxMotorCurrent: number
  maxBatteryCurrent: number
  maxDuty: number
  faultCount: number
  distanceDeltaM: number | null
  gpsDistanceM: number | null
  boundaryBefore: 'none' | 'connected' | 'disconnected' | 'error' | 'gap' | 'app_stop'
  boundaryMessage?: string | null
  gapBeforeMs?: number | null
}

export interface TelemetrySample {
  id: number
  capturedAtMs: number
  deviceId: string | null
  deviceName: string
  speedKmh: number
  batteryVoltage: number
  motorCurrent: number
  batteryCurrent: number
  dutyCycle: number
  pitch: number
  roll: number
  balancePitch: number
  balanceCurrent: number
  erpm: number
  state: number
  switchState: number
  adc1: number
  adc2: number
  odometer: number | null
  tempMosfet: number | null
  tempMotor: number | null
  hasFault: boolean
  faultCode: number
  latitude: number | null
  longitude: number | null
}

export interface HistoryGpsSample {
  id: number
  capturedAtMs: number
  deviceId: string | null
  deviceName: string
  latitude: number
  longitude: number
  speedMps: number | null
  bearingDeg: number | null
  accuracyM: number | null
  altitudeM: number | null
  timestamp: number
  precise: boolean
  distanceFromPreviousM: number | null
}

export interface HistoryMarker {
  id: number
  occurredAtMs: number
  type: 'connected' | 'disconnected' | 'error' | 'gap' | 'app_stop'
  deviceId: string | null
  deviceName: string | null
  message: string | null
  gapMs: number | null
}

export interface HistoryRange {
  boardSamples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
}

export interface TelemetrySummary {
  sampleCount: number
  gpsPointCount: number
  firstAtMs: number | null
  lastAtMs: number | null
  droppedPendingSamples: number
}

export interface LocationTrackingOptions {
  deviceId?: string | null
  deviceName?: string | null
}

// ---------------------------------------------------------------------------
// Typed emitter
// ---------------------------------------------------------------------------

type VescBleEvents = {
  onDevice: (event: DeviceFoundEvent) => void
  onError: (event: ErrorEvent) => void
  onStopRequested: (event: Record<never, never>) => void
  onSessionState: (event: SessionStateEvent) => void
  onTelemetry: (event: TelemetryEvent) => void
  onLocation: (event: LocationEvent) => void
}

interface NativeEventEmitter<TEvents extends Record<string, (...args: never[]) => void>> {
  addListener<EventName extends keyof TEvents>(
    eventName: EventName,
    listener: TEvents[EventName],
  ): EventSubscription
  removeListener<EventName extends keyof TEvents>(
    eventName: EventName,
    listener: TEvents[EventName],
  ): void
  removeAllListeners(eventName: keyof TEvents): void
}

type VescBleNativeModule = NativeEventEmitter<VescBleEvents> & {
  scan(): void
  stopScan(): void
  startLocationUpdates(options?: LocationTrackingOptions): void
  stopLocationUpdates(): void
  setTelemetryRecordingEnabled(enabled: boolean): void
  startAutoConnect(options: Extract<StartSessionOptions, { mode: 'ble' }>): Promise<void>
  stopAutoConnect(): Promise<void>
  startSession(options: StartSessionOptions): Promise<void>
  stopSession(): Promise<void>
  getSessionState(): SessionStateEvent
  listRecordings(): Promise<RecordingInfo[]>
  deleteRecording(path: string): Promise<boolean>
  exportRecording(path: string): Promise<string>
  getTelemetryHistory(options: TelemetryHistoryOptions): Promise<TelemetryHistoryBlock[]>
  getTelemetrySamples(options: {
    fromMs: number
    toMs: number
    deviceId?: string
    limit?: number
  }): Promise<TelemetrySample[]>
  getHistoryRange(options: {
    fromMs: number
    toMs: number
    deviceId?: string
    limit?: number
  }): Promise<HistoryRange>
  getTelemetrySummary(): Promise<TelemetrySummary>
  deleteTelemetryBefore(beforeMs: number): Promise<number>
  clearTelemetryHistory(): Promise<void>
}

const native = requireNativeModule<VescBleNativeModule>('VescBle')
const emitter = native

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Start BLE scan — emits onDevice events for every advertisement received. */
export function scan(): void {
  native.scan()
}

/** Stop ongoing BLE scan. */
export function stopScan(): void {
  native.stopScan()
}

/** Start app-level Android location updates independently of a board session. */
export function startLocationUpdates(options: LocationTrackingOptions = {}): void {
  native.startLocationUpdates(options)
}

/** Stop app-level Android location updates. Board sessions manage their own recording location. */
export function stopLocationUpdates(): void {
  native.stopLocationUpdates()
}

/** Enable or disable native SQLite telemetry history writes. */
export function setTelemetryRecordingEnabled(enabled: boolean): void {
  native.setTelemetryRecordingEnabled(enabled)
}

/** Start native-owned saved-board connection with background reconnect. */
export async function startAutoConnect(
  options: Extract<StartSessionOptions, { mode: 'ble' }>,
): Promise<void> {
  return native.startAutoConnect(options)
}

/** Stop native-owned saved-board connection/reconnect. */
export async function stopAutoConnect(): Promise<void> {
  return native.stopAutoConnect()
}

/** Start a native Android BLE/replay session. The service owns polling and notification updates. */
export async function startSession(options: StartSessionOptions): Promise<void> {
  return native.startSession(options)
}

/** Stop the native Android BLE/replay session. */
export async function stopSession(): Promise<void> {
  return native.stopSession()
}

/** Read the current native Android session state snapshot. */
export function getSessionState(): SessionStateEvent {
  return native.getSessionState()
}

export async function listRecordings(): Promise<RecordingInfo[]> {
  return native.listRecordings()
}

export async function deleteRecording(path: string): Promise<boolean> {
  return native.deleteRecording(path)
}

export async function exportRecording(path: string): Promise<string> {
  return native.exportRecording(path)
}

export async function getTelemetryHistory(
  options: TelemetryHistoryOptions = {},
): Promise<TelemetryHistoryBlock[]> {
  return native.getTelemetryHistory(options)
}

export async function getTelemetrySamples(options: {
  fromMs: number
  toMs: number
  deviceId?: string
  limit?: number
}): Promise<TelemetrySample[]> {
  return native.getTelemetrySamples(options)
}

export async function getHistoryRange(options: {
  fromMs: number
  toMs: number
  deviceId?: string
  limit?: number
}): Promise<HistoryRange> {
  return native.getHistoryRange(options)
}

export async function getTelemetrySummary(): Promise<TelemetrySummary> {
  return native.getTelemetrySummary()
}

export async function deleteTelemetryBefore(beforeMs: number): Promise<number> {
  return native.deleteTelemetryBefore(beforeMs)
}

export async function clearTelemetryHistory(): Promise<void> {
  return native.clearTelemetryHistory()
}

/**
 * Listen for the user tapping "Disconnect" in the foreground service
 * notification. Fires on Android only.
 */
export function addStopRequestedListener(cb: () => void): EventSubscription {
  return emitter.addListener('onStopRequested', cb)
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function addDeviceListener(cb: (event: DeviceFoundEvent) => void): EventSubscription {
  return emitter.addListener('onDevice', cb)
}

export function addErrorListener(cb: (event: ErrorEvent) => void): EventSubscription {
  return emitter.addListener('onError', cb)
}

export function addSessionStateListener(cb: (event: SessionStateEvent) => void): EventSubscription {
  return emitter.addListener('onSessionState', cb)
}

export function addTelemetryListener(cb: (event: TelemetryEvent) => void): EventSubscription {
  return emitter.addListener('onTelemetry', cb)
}

export function addLocationListener(cb: (event: LocationEvent) => void): EventSubscription {
  return emitter.addListener('onLocation', cb)
}

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

export interface NotificationEvent {
  /** Base64-encoded raw bytes from the NUS RX characteristic */
  value: string
}

export interface ConnectedEvent {
  mtu: number
}

export interface DisconnectedEvent {
  status: number
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

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error'
export type SessionMode = 'ble' | 'replay'

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
  telemetry: TelemetryEvent | null
  error: string | null
}

export type StartSessionOptions =
  | {
      mode: 'ble'
      deviceId: string
      deviceName: string
      canId?: number
      pollIntervalMs?: number
      recordingEnabled?: boolean
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

// ---------------------------------------------------------------------------
// Typed emitter
// ---------------------------------------------------------------------------

type VescBleEvents = {
  onDevice: (event: DeviceFoundEvent) => void
  onNotification: (event: NotificationEvent) => void
  onConnected: (event: ConnectedEvent) => void
  onDisconnected: (event: DisconnectedEvent) => void
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
  startSession(options: StartSessionOptions): Promise<void>
  stopSession(): Promise<void>
  getSessionState(): SessionStateEvent
  listRecordings(): Promise<RecordingInfo[]>
  deleteRecording(path: string): Promise<boolean>
  exportRecording(path: string): Promise<string>
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

export function addNotificationListener(cb: (event: NotificationEvent) => void): EventSubscription {
  return emitter.addListener('onNotification', cb)
}

export function addConnectedListener(cb: (event: ConnectedEvent) => void): EventSubscription {
  return emitter.addListener('onConnected', cb)
}

export function addDisconnectedListener(cb: (event: DisconnectedEvent) => void): EventSubscription {
  return emitter.addListener('onDisconnected', cb)
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

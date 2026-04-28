import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface DeviceFoundEvent {
  id: string;
  name: string;
  rssi: number;
  serviceUUIDs: string[];
}

export interface NotificationEvent {
  /** Base64-encoded raw bytes from the NUS RX characteristic */
  value: string;
}

export interface ConnectedEvent {
  mtu: number;
}

export interface DisconnectedEvent {
  status: number;
}

export interface ErrorEvent {
  message: string;
}

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type SessionMode = 'ble' | 'demo';
export type DemoScenario = 'idle' | 'cruise' | 'accel-brake' | 'low-battery' | 'fault';

export interface TelemetryEvent {
  hasFault: boolean;
  faultCode: number;
  pitch: number;
  roll: number;
  balancePitch: number;
  balanceCurrent: number;
  speed: number;
  batteryVoltage: number;
  motorCurrent: number;
  batteryCurrent: number;
  erpm: number;
  dutyCycle: number;
  state: number;
  stateName: string;
  switchState: number;
  adc1: number;
  adc2: number;
  odometer: number | null;
  tempMosfet: number | null;
  tempMotor: number | null;
  avgLatency: number | null;
  lastPacketAt: number;
}

export interface SessionStateEvent {
  status: SessionStatus;
  mode: SessionMode | null;
  deviceId: string | null;
  deviceName: string | null;
  canId: number | null;
  telemetry: TelemetryEvent | null;
  error: string | null;
}

export type StartSessionOptions =
  | {
      mode: 'ble';
      deviceId: string;
      deviceName: string;
      canId?: number;
      pollIntervalMs?: number;
    }
  | {
      mode: 'demo';
      deviceName?: string;
      pollIntervalMs?: number;
      scenario?: DemoScenario;
    };

// ---------------------------------------------------------------------------
// Typed emitter
// ---------------------------------------------------------------------------

type VescBleEvents = {
  onDevice:          (event: DeviceFoundEvent)   => void;
  onNotification:    (event: NotificationEvent)  => void;
  onConnected:       (event: ConnectedEvent)     => void;
  onDisconnected:    (event: DisconnectedEvent)  => void;
  onError:           (event: ErrorEvent)         => void;
  onStopRequested:   (event: Record<never, never>) => void;
  onSessionState:    (event: SessionStateEvent)  => void;
  onTelemetry:       (event: TelemetryEvent)     => void;
};

interface NativeEventEmitter<TEvents extends Record<string, (...args: never[]) => void>> {
  addListener<EventName extends keyof TEvents>(
    eventName: EventName,
    listener: TEvents[EventName],
  ): EventSubscription;
  removeListener<EventName extends keyof TEvents>(
    eventName: EventName,
    listener: TEvents[EventName],
  ): void;
  removeAllListeners(eventName: keyof TEvents): void;
}

type VescBleNativeModule = NativeEventEmitter<VescBleEvents> & {
  scan(): void;
  stopScan(): void;
  connect(deviceId: string): Promise<void>;
  send(base64: string): Promise<void>;
  disconnect(): Promise<void>;
  startSession(options: StartSessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  getSessionState(): SessionStateEvent;
  startForegroundService(deviceName: string): void;
  stopForegroundService(): void;
  updateNotification(text: string): void;
};

const native = requireNativeModule<VescBleNativeModule>('VescBle');
const emitter = native;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Start BLE scan — emits onDevice events for every advertisement received. */
export function scan(): void {
  native.scan();
}

/** Stop ongoing BLE scan. */
export function stopScan(): void {
  native.stopScan();
}

/**
 * Connect to a device by MAC address (Android) / UUID (iOS).
 * Resolves after MTU negotiation, GATT discovery, and CCCD write are complete.
 */
export async function connect(deviceId: string): Promise<void> {
  return native.connect(deviceId);
}

/**
 * Write a single chunk (base64-encoded) to the NUS TX characteristic
 * using write-without-response.
 */
export async function send(base64: string): Promise<void> {
  return native.send(base64);
}

/** Disconnect from the current device and clean up. */
export async function disconnect(): Promise<void> {
  return native.disconnect();
}

/** Start a native Android BLE/demo session. The service owns polling and notification updates. */
export async function startSession(options: StartSessionOptions): Promise<void> {
  return native.startSession(options);
}

/** Stop the native Android BLE/demo session. */
export async function stopSession(): Promise<void> {
  return native.stopSession();
}

/** Read the current native Android session state snapshot. */
export function getSessionState(): SessionStateEvent {
  return native.getSessionState();
}

/**
 * Start an Android foreground service that keeps the process alive while
 * backgrounded. Shows a persistent notification (required by Android).
 * No-op on other platforms.
 */
export function startForegroundService(deviceName: string): void {
  native.startForegroundService(deviceName);
}

/** Stop the Android foreground service started by startForegroundService. */
export function stopForegroundService(): void {
  native.stopForegroundService();
}

/** Update the foreground service notification text. No-op if the service is not running. */
export function updateNotification(text: string): void {
  native.updateNotification(text);
}

/**
 * Listen for the user tapping "Disconnect" in the foreground service
 * notification. Fires on Android only.
 */
export function addStopRequestedListener(
  cb: () => void,
): EventSubscription {
  return emitter.addListener('onStopRequested', cb);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function addDeviceListener(
  cb: (event: DeviceFoundEvent) => void,
): EventSubscription {
  return emitter.addListener('onDevice', cb);
}

export function addNotificationListener(
  cb: (event: NotificationEvent) => void,
): EventSubscription {
  return emitter.addListener('onNotification', cb);
}

export function addConnectedListener(
  cb: (event: ConnectedEvent) => void,
): EventSubscription {
  return emitter.addListener('onConnected', cb);
}

export function addDisconnectedListener(
  cb: (event: DisconnectedEvent) => void,
): EventSubscription {
  return emitter.addListener('onDisconnected', cb);
}

export function addErrorListener(
  cb: (event: ErrorEvent) => void,
): EventSubscription {
  return emitter.addListener('onError', cb);
}

export function addSessionStateListener(
  cb: (event: SessionStateEvent) => void,
): EventSubscription {
  return emitter.addListener('onSessionState', cb);
}

export function addTelemetryListener(
  cb: (event: TelemetryEvent) => void,
): EventSubscription {
  return emitter.addListener('onTelemetry', cb);
}

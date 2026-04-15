import { requireNativeModule, EventEmitter, type Subscription } from 'expo-modules-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const native = requireNativeModule<any>('VescBle');
const emitter = new EventEmitter(native);

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export type DeviceFoundEvent = {
  id: string;
  name: string;
  rssi: number;
  serviceUUIDs: string[];
};

export type NotificationEvent = {
  /** Base64-encoded raw bytes from the NUS RX characteristic */
  value: string;
};

export type ConnectedEvent = {
  mtu: number;
};

export type DisconnectedEvent = {
  status: number;
};

export type ErrorEvent = {
  message: string;
};

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

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function addDeviceListener(
  cb: (event: DeviceFoundEvent) => void,
): Subscription {
  return emitter.addListener('onDevice', cb);
}

export function addNotificationListener(
  cb: (event: NotificationEvent) => void,
): Subscription {
  return emitter.addListener('onNotification', cb);
}

export function addConnectedListener(
  cb: (event: ConnectedEvent) => void,
): Subscription {
  return emitter.addListener('onConnected', cb);
}

export function addDisconnectedListener(
  cb: (event: DisconnectedEvent) => void,
): Subscription {
  return emitter.addListener('onDisconnected', cb);
}

export function addErrorListener(
  cb: (event: ErrorEvent) => void,
): Subscription {
  return emitter.addListener('onError', cb);
}

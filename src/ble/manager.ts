import type { Subscription } from 'expo-modules-core';
import {
  scan as nativeScan,
  stopScan as nativeStopScan,
  connect as nativeConnect,
  send as nativeSend,
  disconnect as nativeDisconnect,
  addDeviceListener,
  addNotificationListener,
  addDisconnectedListener,
} from 'vesc-ble';
import { encode } from '../vesc/packet';
import { Reassembler } from '../vesc/reassembler';
import { NUS_SERVICE, VESC_NAME_PREFIXES } from './nus';

// ---------------------------------------------------------------------------
// Base64 helpers (uses global atob/btoa available in RN 0.71+)
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Chunk helper — split a Uint8Array into MTU-sized pieces
// ---------------------------------------------------------------------------

function* chunks(data: Uint8Array, size: number): Generator<Uint8Array> {
  for (let i = 0; i < data.length; i += size) {
    yield data.slice(i, i + size);
  }
}

// ---------------------------------------------------------------------------
// Minimal type for devices surfaced to callers
// ---------------------------------------------------------------------------

export interface ScannedDevice {
  id: string;
  name: string;
  rssi: number;
}

// ---------------------------------------------------------------------------
// VescBle — singleton BLE manager backed by the native vesc-ble module
// ---------------------------------------------------------------------------

const WRITE_CHUNK_SIZE = 180;

class VescBle {
  private _connected = false;
  private _onPacket: ((payload: Uint8Array) => void) | null = null;
  private reassembler = new Reassembler();

  private scanSub: Subscription | null = null;
  private notifSub: Subscription | null = null;
  private disconnSub: Subscription | null = null;

  // -------------------------------------------------------------------------
  // Scanning
  // -------------------------------------------------------------------------

  scan(onFound: (d: ScannedDevice) => void): void {
    this.scanSub?.remove();
    this.scanSub = addDeviceListener((event) => {
      const name = event.name ?? '';
      const isKnown = VESC_NAME_PREFIXES.some((prefix) =>
        name.toLowerCase().startsWith(prefix.toLowerCase()),
      );
      const hasNus = event.serviceUUIDs?.includes(NUS_SERVICE) ?? false;
      if (isKnown || hasNus) {
        onFound({ id: event.id, name, rssi: event.rssi });
      }
    });
    nativeScan();
  }

  stopScan(): void {
    nativeStopScan();
    this.scanSub?.remove();
    this.scanSub = null;
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(
    deviceId: string,
    onPacket: (payload: Uint8Array) => void,
  ): Promise<void> {
    nativeStopScan();
    this.scanSub?.remove();
    this.scanSub = null;

    this._onPacket = onPacket;
    this.reassembler.reset();

    // Wire up notification listener BEFORE connect so we don't miss early packets
    this.notifSub?.remove();
    this.notifSub = addNotificationListener((event) => {
      console.log('[BLE] onNotification len:', event.value.length);
      const bytes = base64ToBytes(event.value);
      for (const pkt of this.reassembler.feed(bytes)) {
        this._onPacket?.(pkt);
      }
    });

    this.disconnSub?.remove();
    this.disconnSub = addDisconnectedListener((event) => {
      console.log('[BLE] disconnected status=', event.status);
      this._connected = false;
    });

    console.log('[BLE] connecting to', deviceId);
    await nativeConnect(deviceId);
    this._connected = true;
    console.log('[BLE] connected:', deviceId);

    // Give the peripheral a moment to activate CCCD
    await new Promise<void>((r) => setTimeout(r, 500));

    // COMM_FW_VERSION (0x00) — first command the Floatwheel app sends; triggers a
    // response that confirms the BLE notification path is working end-to-end.
    console.log('[BLE] sending COMM_FW_VERSION');
    await this.send(new Uint8Array([0x00]));
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  private lastSendLog = 0;

  async send(payload: Uint8Array): Promise<void> {
    if (!this._connected) throw new Error('VescBle.send: not connected');

    const framed = encode(payload);

    const now = Date.now();
    if (now - this.lastSendLog > 2000) {
      console.log(`[BLE] send cmd=0x${payload[0]?.toString(16)} framed=${framed.length}B`);
      this.lastSendLog = now;
    }

    for (const chunk of chunks(framed, WRITE_CHUNK_SIZE)) {
      await nativeSend(bytesToBase64(chunk));
    }
  }

  // -------------------------------------------------------------------------
  // Disconnection
  // -------------------------------------------------------------------------

  async disconnect(): Promise<void> {
    this._connected = false;
    this._onPacket = null;

    this.notifSub?.remove();
    this.notifSub = null;
    this.disconnSub?.remove();
    this.disconnSub = null;
    this.scanSub?.remove();
    this.scanSub = null;

    this.reassembler.reset();
    await nativeDisconnect();
  }

  get isConnected(): boolean {
    return this._connected;
  }
}

export const vescBle = new VescBle();

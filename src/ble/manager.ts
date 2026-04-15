import { BleManager, type Characteristic, type Device, type Subscription } from 'react-native-ble-plx';
import { DeviceEventEmitter } from 'react-native';
import { encode } from '../vesc/packet';
import { Reassembler } from '../vesc/reassembler';
import { NUS_RX_CHAR, NUS_SERVICE, NUS_TX_CHAR, VESC_NAME_PREFIXES } from './nus';

// ---------------------------------------------------------------------------
// Raw event tap via DeviceEventEmitter — works with both old bridge and
// New Architecture TurboModules.  ble-plx emits "ReadEvent" when a BLE
// notification arrives on the native side.
//
// [BLE RAW] fires + [BLE] notification len never fires → ble-plx JS-layer bug
// [BLE RAW] never fires → native side receives nothing (device not sending)
// ---------------------------------------------------------------------------
DeviceEventEmitter.addListener('ReadEvent', (data: unknown) => {
  console.log('[BLE RAW] ReadEvent:', JSON.stringify(data).slice(0, 150));
});

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
// VescBle — singleton BLE manager
// ---------------------------------------------------------------------------

const WRITE_CHUNK_SIZE = 180;

class VescBle {
  private mgr = new BleManager();
  private device: Device | null = null;
  private txChar: Characteristic | null = null; // write target
  private monitor: Subscription | null = null;
  private reassembler = new Reassembler();

  // -------------------------------------------------------------------------
  // Scanning
  // -------------------------------------------------------------------------

  scan(onFound: (d: Device) => void): void {
    this.mgr.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error || !device) return;
        const name = device.name ?? device.localName ?? '';
        const isKnown = VESC_NAME_PREFIXES.some((prefix) =>
          name.toLowerCase().startsWith(prefix.toLowerCase()),
        );
        if (isKnown || device.serviceUUIDs?.includes(NUS_SERVICE)) {
          onFound(device);
        }
      },
    );
  }

  stopScan(): void {
    this.mgr.stopDeviceScan();
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(
    deviceId: string,
    onPacket: (payload: Uint8Array) => void,
  ): Promise<void> {
    this.mgr.stopDeviceScan();
    await new Promise<void>((r) => setTimeout(r, 300));

    this.device = await this.mgr.connectToDevice(deviceId, { timeout: 10000 });
    console.log('[BLE] connected:', deviceId);

    try {
      const d = await this.device.requestMTU(244);
      console.log('[BLE] MTU:', d.mtu);
    } catch (e) {
      console.warn('[BLE] MTU request failed (non-fatal):', e);
    }

    await this.device.discoverAllServicesAndCharacteristics();
    console.log('[BLE] GATT discovery complete');

    // Resolve characteristic objects directly — avoids UUID lookup issues
    // with ble-plx on New Architecture.
    const chars = await this.device.characteristicsForService(NUS_SERVICE);
    console.log('[BLE] NUS characteristics found:', chars.length);

    let rxChar: Characteristic | undefined;
    for (const ch of chars) {
      console.log(
        `[BLE]   char: ${ch.uuid} notify=${ch.isNotifiable}` +
        ` writeResp=${ch.isWritableWithResponse} writeNoResp=${ch.isWritableWithoutResponse}`,
      );
      if (ch.uuid === NUS_RX_CHAR) rxChar = ch;        // notifiable (device→phone)
      if (ch.uuid === NUS_TX_CHAR) this.txChar = ch;   // writable  (phone→device)
    }

    if (!rxChar) throw new Error(`NUS RX char (${NUS_RX_CHAR}) not found`);
    if (!this.txChar) throw new Error(`NUS TX char (${NUS_TX_CHAR}) not found`);

    this.reassembler.reset();

    // ---------------------------------------------------------------------------
    // Manually write CCCD (0x0100) to enable notifications.
    // rxandroidble2's QUICK_SETUP mode queues the write internally but it
    // stalls on some devices (Floatwheel ADV2 / VESC Express firmware).
    // A direct writeDescriptorForDevice bypasses the rxandroidble2 queue
    // and guarantees the peripheral receives the CCCD enable command.
    // CCCD UUID: 00002902-0000-1000-8000-00805f9b34fb  value: 0x0100 = btoa('\x01\x00')
    // ---------------------------------------------------------------------------
    const CCCD_UUID = '00002902-0000-1000-8000-00805f9b34fb';
    const CCCD_ENABLE = btoa('\x01\x00'); // base64 of [0x01, 0x00]
    try {
      console.log('[BLE] writing CCCD to enable notifications...');
      await this.mgr.writeDescriptorForDevice(
        this.device.id,
        NUS_SERVICE,
        NUS_RX_CHAR,
        CCCD_UUID,
        CCCD_ENABLE,
      );
      console.log('[BLE] CCCD written OK');
    } catch (e) {
      console.warn('[BLE] CCCD write failed (non-fatal):', e);
    }

    // Use characteristic.monitor() instead of device.monitorCharacteristicForService —
    // different native code path, works more reliably with New Architecture.
    console.log('[BLE] rxChar internal id:', rxChar.id, 'uuid:', rxChar.uuid);
    console.log('[BLE] subscribing via characteristic.monitor()');
    this.monitor = rxChar.monitor((err, characteristic) => {
      if (err) {
        console.error('[BLE] monitor error:', err.message, err.errorCode);
        return;
      }
      if (!characteristic?.value) return;
      console.log('[BLE] notification len:', characteristic.value.length);
      const bytes = base64ToBytes(characteristic.value);
      for (const pkt of this.reassembler.feed(bytes)) {
        onPacket(pkt);
      }
    });
    console.log('[BLE] monitor active');

    // Give the peripheral time to activate the CCCD notification subscription.
    await new Promise<void>((r) => setTimeout(r, 1000));

    // COMM_ALIVE (0x1E) — wake up VESC before GET_VALUES polling starts.
    console.log('[BLE] sending COMM_ALIVE ping');
    await this.send(new Uint8Array([0x1e]));
  }

  // -------------------------------------------------------------------------
  // Sending — uses cached txChar object for direct write
  // -------------------------------------------------------------------------

  private lastSendLog = 0;

  async send(payload: Uint8Array): Promise<void> {
    if (!this.txChar) throw new Error('VescBle.send: not connected');

    const framed = encode(payload);

    const now = Date.now();
    if (now - this.lastSendLog > 2000) {
      console.log(`[BLE] send cmd=0x${payload[0]?.toString(16)} framed=${framed.length}B`);
      this.lastSendLog = now;
    }

    for (const chunk of chunks(framed, WRITE_CHUNK_SIZE)) {
      await this.txChar.writeWithoutResponse(bytesToBase64(chunk));
    }
  }

  // -------------------------------------------------------------------------
  // Disconnection
  // -------------------------------------------------------------------------

  async disconnect(): Promise<void> {
    this.monitor?.remove();
    this.monitor = null;
    this.txChar = null;

    if (this.device) {
      try {
        await this.mgr.cancelDeviceConnection(this.device.id);
      } catch {
        // device may have already disconnected
      }
      this.device = null;
    }

    this.reassembler.reset();
  }

  get isConnected(): boolean {
    return this.device !== null;
  }
}

export const vescBle = new VescBle();

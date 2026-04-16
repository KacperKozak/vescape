import { create } from 'zustand';
import { vescBle } from '../ble/manager';
import { parsePingCan, Comm } from '../vesc/commands';
import { buildGetAllData, parseGetAllData, REFLOAT_MAGIC, RefloatCmd } from '../vesc/refloat';
import type { RefloatValues } from '../vesc/types';

import type { ScannedDevice } from '../ble/manager';
export type { ScannedDevice };

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

interface BleState {
  status: BleStatus;
  devices: ScannedDevice[];
  connectedId: string | null;
  refloatValues: RefloatValues | null;
  error: string | undefined;
  /** Total BLE notification packets received — useful for diagnosing no-data issues */
  rxCount: number;
  /** Timestamp (ms) of the last successfully parsed refloat packet */
  lastPacketAt: number | null;
  /** Rolling average round-trip time in ms (poll sent → response received) */
  avgLatency: number | null;
}

interface BleActions {
  startScan: () => void;
  stopScan: () => void;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal polling interval handle + RTT tracking
// ---------------------------------------------------------------------------
let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastPollAt = 0;
let rttHistory: number[] = [];
const RTT_HISTORY_SIZE = 5;

function stopPolling(): void {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function startPolling(): void {
  stopPolling();
  // 2 Hz — poll GET_ALLDATA (mode 2) with CAN forwarding
  pollInterval = setInterval(() => {
    if (vescBle.canId !== undefined) {
      lastPollAt = Date.now();
      vescBle.send(buildGetAllData(vescBle.canId, 2)).catch((err) => {
        console.warn('[BLE] send failed:', err?.message ?? err);
      });
    }
  }, 500);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBleStore = create<BleState & BleActions>((set, get) => ({
  // ---- state ----
  status: 'idle',
  devices: [],
  connectedId: null,
  refloatValues: null,
  error: undefined,
  rxCount: 0,
  lastPacketAt: null,
  avgLatency: null,

  // ---- actions ----

  startScan() {
    set({ status: 'scanning', devices: [], error: undefined });

    vescBle.scan((device) => {
      const name = device.name || device.id;
      const rssi = device.rssi ?? -99;

      set((state) => {
        // Deduplicate by id, update RSSI if already present
        const existing = state.devices.findIndex((d) => d.id === device.id);
        if (existing !== -1) {
          const updated = [...state.devices];
          updated[existing] = { id: device.id, name, rssi };
          return { devices: updated };
        }
        return { devices: [...state.devices, { id: device.id, name, rssi }] };
      });
    });
  },

  stopScan() {
    vescBle.stopScan();
    set((state) => ({
      status: state.status === 'scanning' ? 'idle' : state.status,
    }));
  },

  async connect(id: string) {
    const { stopScan } = get();
    stopScan();
    rttHistory = [];
    lastPollAt = 0;
    set({ status: 'connecting', connectedId: null, refloatValues: null, error: undefined, lastPacketAt: null, avgLatency: null });

    const onPacket = (payload: Uint8Array) => {
      set((s) => ({ rxCount: s.rxCount + 1 }));

      const cmd = payload[0];
      console.log(`[BLE] packet cmd=0x${cmd?.toString(16).padStart(2, '0')} len=${payload.length}`);

      if (cmd === Comm.CUSTOM_APP_DATA) {
        // Refloat COMMAND_GET_ALLDATA response
        if (payload[1] === REFLOAT_MAGIC && payload[2] === RefloatCmd.GET_ALLDATA) {
          try {
            const refloatValues = parseGetAllData(payload);
            const rtt = lastPollAt > 0 ? Date.now() - lastPollAt : null;
            if (rtt !== null) {
              rttHistory.push(rtt);
              if (rttHistory.length > RTT_HISTORY_SIZE) rttHistory.shift();
            }
            const avgLatency =
              rttHistory.length > 0
                ? Math.round(rttHistory.reduce((a, b) => a + b, 0) / rttHistory.length)
                : null;
            set({ refloatValues, lastPacketAt: Date.now(), avgLatency });
          } catch (err) {
            console.warn('[BLE] parseGetAllData failed:', err);
          }
        } else {
          console.log(
            `[BLE] CUSTOM_APP_DATA: magic=${payload[1]} cmd=${payload[2]} (not Refloat GET_ALLDATA)`,
          );
        }
      } else if (cmd === Comm.PING_CAN) {
        const ids = parsePingCan(payload);
        console.log('[BLE] PING_CAN response — CAN devices found:', ids);
        if (ids.length > 0) {
          vescBle.canId = ids[0];
          console.log(`[BLE] using CAN ID ${ids[0]} for motor controller commands`);
        } else {
          console.warn('[BLE] PING_CAN: no CAN devices found — GET_ALLDATA may not respond');
        }
      } else {
        // Log unexpected command bytes to help spot firmware differences
        const hex = Array.from(payload.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log(`[BLE] unhandled cmd=0x${cmd?.toString(16)} first bytes: ${hex}`);
      }
    };

    const onDisconnect = () => {
      console.warn('[BLE] remote disconnect detected');
      stopPolling();
      vescBle.canId = undefined;
      set({
        status: 'error',
        connectedId: null,
        refloatValues: null,
        error: 'Board disconnected',
      });
    };

    // Retry loop — status=133 is a common Android GATT_ERROR on the first
    // reconnect attempt to a bonded device. One immediate retry fixes it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await vescBle.connect(id, onPacket, onDisconnect);
        set({ status: 'connected', connectedId: id });
        startPolling();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 1 && msg.includes('133')) {
          console.warn('[BLE] status=133 (bonded device quirk) — retrying once');
          continue;
        }
        set({ status: 'error', error: msg });
        return;
      }
    }
  },

  async disconnect() {
    stopPolling();
    rttHistory = [];
    lastPollAt = 0;
    await vescBle.disconnect();
    vescBle.canId = undefined;
    set({
      status: 'idle',
      connectedId: null,
      refloatValues: null,
      error: undefined,
      rxCount: 0,
      lastPacketAt: null,
      avgLatency: null,
    });
  },
}));

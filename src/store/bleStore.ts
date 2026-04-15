import { create } from 'zustand';
import { vescBle } from '../ble/manager';
import { parsePingCan, Comm } from '../vesc/commands';
import { buildGetAllData, parseGetAllData, REFLOAT_MAGIC, RefloatCmd } from '../vesc/refloat';
import type { RefloatValues } from '../vesc/types';

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export type ScannedDevice = {
  id: string;
  name: string;
  rssi: number;
};

type BleState = {
  status: BleStatus;
  devices: ScannedDevice[];
  connectedId: string | null;
  refloatValues: RefloatValues | null;
  error: string | undefined;
  /** Total BLE notification packets received — useful for diagnosing no-data issues */
  rxCount: number;
};

type BleActions = {
  startScan: () => void;
  stopScan: () => void;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Internal polling interval handle
// ---------------------------------------------------------------------------
let pollInterval: ReturnType<typeof setInterval> | null = null;

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
    set({ status: 'connecting', connectedId: null, refloatValues: null, error: undefined });

    try {
      await vescBle.connect(id, (payload) => {
        set((s) => ({ rxCount: s.rxCount + 1 }));

        const cmd = payload[0];
        console.log(`[BLE] packet cmd=0x${cmd?.toString(16).padStart(2, '0')} len=${payload.length}`);

        if (cmd === Comm.CUSTOM_APP_DATA) {
          // Refloat COMMAND_GET_ALLDATA response
          if (payload[1] === REFLOAT_MAGIC && payload[2] === RefloatCmd.GET_ALLDATA) {
            try {
              const refloatValues = parseGetAllData(payload);
              set({ refloatValues });
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
      });

      set({ status: 'connected', connectedId: id });
      startPolling();
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async disconnect() {
    stopPolling();
    await vescBle.disconnect();
    vescBle.canId = undefined;
    set({
      status: 'idle',
      connectedId: null,
      refloatValues: null,
      error: undefined,
      rxCount: 0,
    });
  },
}));

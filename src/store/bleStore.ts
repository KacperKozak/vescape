import { create } from 'zustand';
import type { EventSubscription } from 'expo-modules-core';
import { startSession, stopSession, addSessionStateListener, addTelemetryListener } from 'vesc-ble';
import { vescBle } from '../ble/manager';
import { type RefloatValues } from '../vesc/types';
import { VIRTUAL_BOARD_NAME } from '../simulator/virtualBoard';

import type { ScannedDevice } from '../ble/manager';
export type { ScannedDevice };

export const VIRTUAL_BOARD_ID = '__virtual__';

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
// Native session subscriptions
// ---------------------------------------------------------------------------

let telemetrySub: EventSubscription | null = null;
let sessionSub: EventSubscription | null = null;

function removeSessionSubscriptions(): void {
  telemetrySub?.remove();
  telemetrySub = null;
  sessionSub?.remove();
  sessionSub = null;
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
    const virtualDevice: ScannedDevice = { id: VIRTUAL_BOARD_ID, name: VIRTUAL_BOARD_NAME, rssi: -45 };
    set({ status: 'scanning', devices: [virtualDevice], error: undefined });

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
    set({ status: 'connecting', connectedId: null, refloatValues: null, error: undefined, lastPacketAt: null, avgLatency: null });

    removeSessionSubscriptions();
    telemetrySub = addTelemetryListener((telemetry) => {
      const { avgLatency, lastPacketAt, stateName: _stateName, ...refloatValues } = telemetry;
      set((s) => ({
        refloatValues: refloatValues as RefloatValues,
        lastPacketAt,
        avgLatency,
        rxCount: s.rxCount + 1,
      }));
    });
    sessionSub = addSessionStateListener((session) => {
      set({
        status: session.status === 'error' ? 'error' : session.status,
        connectedId: session.deviceId,
        error: session.error ?? undefined,
      });
    });

    const device = get().devices.find((d) => d.id === id);
    const deviceName = id === VIRTUAL_BOARD_ID ? VIRTUAL_BOARD_NAME : (device?.name || id);

    try {
      await startSession(
        id === VIRTUAL_BOARD_ID
          ? { mode: 'demo', deviceName, scenario: 'cruise', pollIntervalMs: 500 }
          : { mode: 'ble', deviceId: id, deviceName, pollIntervalMs: 500 },
      );
      set({ status: 'connected', connectedId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ status: 'error', error: msg });
    }
  },

  async disconnect() {
    await stopSession();
    removeSessionSubscriptions();
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

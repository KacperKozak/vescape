import { create } from 'zustand'
import { getSettings, updateSetting, type AppSettings } from 'vesc-ble'

const DEFAULTS: AppSettings = {
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: false,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
  movingSpeedThresholdKmh: 3,
  freeSpinMaxSpeedDeltaKmh: 12,
  freeSpinStationaryBoardCapKmh: 15,
  mapStyleKey: 'onedark',
  mapNavigationMode: 'northUp',
}

interface SettingsState extends AppSettings {
  loaded: boolean
  load: () => Promise<void>
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

export function useLiveWindowMs(): number {
  return useSettingsStore((s) => s.liveHistoryLimit) * 60_000
}

export function getLiveWindowMs(): number {
  return useSettingsStore.getState().liveHistoryLimit * 60_000
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  async load() {
    try {
      const s = await getSettings()
      set({ ...s, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  async set(key, value) {
    set({ [key]: value })
    await updateSetting(key, value)
  },
}))

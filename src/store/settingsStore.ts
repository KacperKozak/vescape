import { create } from 'zustand'
import { getSettings, setCompanionPresenceEnabled, updateSetting, type AppSettings } from 'vesc-ble'
import { DEFAULT_HISTORY_METRIC_HOT_RANGES } from '@/lib/history/metricColorScale'

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
  historyMetricGradientsEnabled: true,
  historyMetricHotRanges: DEFAULT_HISTORY_METRIC_HOT_RANGES,
  socEstimateWindowSeconds: 20,
  connectionSoundsEnabled: true,
  companionPresenceEnabled: false,
  telemetryPollRateHz: 20,
  wearMirrorIntervalMs: 500,
  riderId: null,
  riderName: null,
  riderColor: null,
}

interface SettingsState extends AppSettings {
  loaded: boolean
  load: () => Promise<void>
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  setCompanionPresence: (enabled: boolean) => Promise<void>
}

export function useLiveWindowMs(): number {
  return useSettingsStore((s) => s.liveHistoryLimit) * 60_000
}

export function getLiveWindowMs(): number {
  return useSettingsStore.getState().liveHistoryLimit * 60_000
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  async load() {
    try {
      const s = await getSettings()
      set({
        ...s,
        autoConnect: s.companionPresenceEnabled ? true : s.autoConnect,
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  async set(key, value) {
    if (key === 'autoConnect' && value === false && get().companionPresenceEnabled) return
    set({ [key]: value })
    await updateSetting(key, value)
  },

  async setCompanionPresence(enabled) {
    await setCompanionPresenceEnabled(enabled)
    set(
      enabled
        ? { companionPresenceEnabled: true, autoConnect: true }
        : { companionPresenceEnabled: false },
    )
  },
}))

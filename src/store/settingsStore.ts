import { create } from 'zustand'
import { getSettings, updateSetting, type AppSettings } from 'vesc-ble'

const DEFAULTS: AppSettings = {
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: false,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
}

interface SettingsState extends AppSettings {
  loaded: boolean
  load: () => Promise<void>
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

const MIN_LIVE_HISTORY_MINUTES = 1

export function useLiveWindowMs(): number {
  const minutes = useSettingsStore((s) => s.liveHistoryLimit)
  const safe =
    Number.isFinite(minutes) && minutes >= MIN_LIVE_HISTORY_MINUTES
      ? minutes
      : DEFAULTS.liveHistoryLimit
  return safe * 60_000
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

import { dequal } from 'dequal'
import { create } from 'zustand'
import { getSettings, setCompanionPresenceEnabled, updateSetting, type AppSettings } from 'vesc-ble'
import { DEFAULT_HISTORY_METRIC_HOT_RANGES } from '@/lib/history/metricColorScale'
import { DEFAULT_LEGAL_MODE_SETTINGS, type LegalModeSettings } from '@/lib/legalMode'
import {
  DEFAULT_SATELLITE_IMAGERY_OPACITY,
  DEFAULT_SATELLITE_MAP_IMAGERY_OPACITY,
  DEFAULT_SATELLITE_IMAGERY_SATURATION,
} from '@/constants/satelliteDarkMapStyle'

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
  satelliteOverlayEnabled: true,
  satelliteImageryOpacity: DEFAULT_SATELLITE_IMAGERY_OPACITY,
  satelliteMapImageryOpacity: DEFAULT_SATELLITE_MAP_IMAGERY_OPACITY,
  satelliteImagerySaturation: DEFAULT_SATELLITE_IMAGERY_SATURATION,
  hideTelemetryMapDetails: true,
  mapNavigationMode: 'northUp',
  historyMetricGradientsEnabled: true,
  historyMetricHotRanges: DEFAULT_HISTORY_METRIC_HOT_RANGES,
  socEstimateWindowSeconds: 20,
  connectionSoundsEnabled: true,
  companionPresenceEnabled: false,
  boardWarningsEnabled: true,
  companionPresenceCooldownMinutes: 60,
  autoCloseEnabled: false,
  autoCloseDelayMinutes: 15,
  telemetryPollRateHz: 20,
  wearMirrorIntervalMs: 500,
  wearAutoLaunchOnConnect: true,
  riderId: null,
  riderName: null,
  riderColor: null,
  legalMode: DEFAULT_LEGAL_MODE_SETTINGS as unknown as Record<string, unknown>,
}

interface SettingsState extends AppSettings {
  loaded: boolean
  load: () => Promise<void>
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  setLegalMode: (value: LegalModeSettings) => Promise<void>
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
      const next: AppSettings = {
        ...s,
        autoConnect: s.companionPresenceEnabled ? true : s.autoConnect,
      }
      // Reloads can fire often (e.g. the 30s GPS write emits `settings`). Set only the keys that
      // actually changed so untouched selectors don't re-render, and bail entirely when nothing did.
      const prev = get()
      const patch: Partial<SettingsState> = {}
      for (const key of Object.keys(next) as (keyof AppSettings)[]) {
        if (!dequal(prev[key], next[key])) patch[key] = next[key] as never
      }
      if (!prev.loaded) patch.loaded = true
      if (Object.keys(patch).length > 0) set(patch)
    } catch {
      if (!get().loaded) set({ loaded: true })
    }
  },

  async set(key, value) {
    if (key === 'autoConnect' && value === false && get().companionPresenceEnabled) return
    set({ [key]: value })
    await updateSetting(key, value)
  },

  async setLegalMode(value) {
    set({ legalMode: value as unknown as Record<string, unknown> })
    await updateSetting('legalMode', value as unknown as Record<string, unknown>)
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

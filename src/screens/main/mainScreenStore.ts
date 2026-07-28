import { create } from 'zustand'

import type { HistoryMetricKey } from '@/modules/history/lib/metricColorScale'
import type { MainViewState } from '@/screens/main/mainViewState'

export type MapSelector = 'navigation' | 'style' | null

/** Which list the history screen shows: recorded rides, or the Favorites the rider starred. */
export type HistoryTab = 'history' | 'favorites'

interface MainScreenState {
  mode: MainViewState
  historyTab: HistoryTab
  historySheetVisible: boolean
  mapSelector: MapSelector
  perspectiveEnabled: boolean
  seekTimeMs: number | null
  activeHistoryMapMetric: HistoryMetricKey
}

interface MainScreenActions {
  reset: () => void
  enterTelemetry: () => void
  enterMap: () => void
  enterWeather: () => void
  enterLegalLimits: () => void
  enterHistory: () => void
  setHistoryTab: (tab: HistoryTab) => void
  setHistorySheetVisible: (visible: boolean) => void
  setMapSelector: (selector: MapSelector) => void
  dismissMapSelector: () => void
  setPerspectiveEnabled: (enabled: boolean) => void
  setSeekTimeMs: (timeMs: number | null) => void
  setActiveHistoryMapMetric: (metric: HistoryMetricKey) => void
}

const initialState: MainScreenState = {
  mode: 'telemetry',
  historyTab: 'history',
  historySheetVisible: false,
  mapSelector: null,
  perspectiveEnabled: true,
  seekTimeMs: null,
  activeHistoryMapMetric: 'speed',
}

export const useMainScreenStore = create<MainScreenState & MainScreenActions>((set) => ({
  ...initialState,

  reset() {
    set(initialState)
  },

  enterTelemetry() {
    set({ mode: 'telemetry', historySheetVisible: false, mapSelector: null, seekTimeMs: null })
  },

  enterMap() {
    set({ mode: 'map', mapSelector: null })
  },

  enterWeather() {
    set({ mode: 'weather', mapSelector: null })
  },

  enterLegalLimits() {
    set({ mode: 'legalLimits', mapSelector: null })
  },

  enterHistory() {
    set({ mode: 'history', mapSelector: null })
  },

  setHistoryTab(tab) {
    set((state) =>
      state.historyTab === tab ? state : { historyTab: tab, historySheetVisible: false },
    )
  },

  setHistorySheetVisible(visible) {
    set({ historySheetVisible: visible })
  },

  setMapSelector(selector) {
    set((state) => (state.mapSelector === selector ? state : { mapSelector: selector }))
  },

  dismissMapSelector() {
    set((state) => (state.mapSelector === null ? state : { mapSelector: null }))
  },

  setPerspectiveEnabled(enabled) {
    set({ perspectiveEnabled: enabled })
  },

  setSeekTimeMs(timeMs) {
    set((state) => (state.seekTimeMs === timeMs ? state : { seekTimeMs: timeMs }))
  },

  setActiveHistoryMapMetric(metric) {
    set((state) =>
      state.activeHistoryMapMetric === metric ? state : { activeHistoryMapMetric: metric },
    )
  },
}))

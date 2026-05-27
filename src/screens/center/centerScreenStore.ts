import { create } from 'zustand'

import type { CenterViewState } from '@/screens/center/centerViewState'

export type MapSelector = 'navigation' | 'style' | null

interface CenterScreenState {
  mode: CenterViewState
  historySheetVisible: boolean
  mapSelector: MapSelector
  perspectiveEnabled: boolean
  seekTimeMs: number | null
}

interface CenterScreenActions {
  reset: () => void
  enterTelemetry: () => void
  enterMap: () => void
  enterWeather: () => void
  enterHistory: () => void
  setHistorySheetVisible: (visible: boolean) => void
  setMapSelector: (selector: MapSelector) => void
  dismissMapSelector: () => void
  setPerspectiveEnabled: (enabled: boolean) => void
  setSeekTimeMs: (timeMs: number | null) => void
}

const initialState: CenterScreenState = {
  mode: 'telemetry',
  historySheetVisible: false,
  mapSelector: null,
  perspectiveEnabled: true,
  seekTimeMs: null,
}

export const useCenterScreenStore = create<CenterScreenState & CenterScreenActions>((set) => ({
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

  enterHistory() {
    set({ mode: 'history', mapSelector: null })
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
    set({ seekTimeMs: timeMs })
  },
}))

import { create } from 'zustand'

import type { MapStyleKey } from '@/constants/mapStyles'
import type { CenterViewState } from '@/screens/center/centerViewState'

interface CenterScreenState {
  mode: CenterViewState
  historySheetVisible: boolean
  mapStyleKey: MapStyleKey
  rotationLocked: boolean
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
  setMapStyleKey: (key: MapStyleKey) => void
  setRotationLocked: (locked: boolean | ((prev: boolean) => boolean)) => void
  setPerspectiveEnabled: (enabled: boolean) => void
  setSeekTimeMs: (timeMs: number | null) => void
}

const initialState: CenterScreenState = {
  mode: 'telemetry',
  historySheetVisible: false,
  mapStyleKey: 'onedark',
  rotationLocked: true,
  perspectiveEnabled: true,
  seekTimeMs: null,
}

export const useCenterScreenStore = create<CenterScreenState & CenterScreenActions>((set) => ({
  ...initialState,

  reset() {
    set(initialState)
  },

  enterTelemetry() {
    set({ mode: 'telemetry', historySheetVisible: false, seekTimeMs: null })
  },

  enterMap() {
    set({ mode: 'map' })
  },

  enterWeather() {
    set({ mode: 'weather' })
  },

  enterHistory() {
    set({ mode: 'history' })
  },

  setHistorySheetVisible(visible) {
    set({ historySheetVisible: visible })
  },

  setMapStyleKey(key) {
    set({ mapStyleKey: key })
  },

  setRotationLocked(locked) {
    set((state) => ({
      rotationLocked: typeof locked === 'function' ? locked(state.rotationLocked) : locked,
    }))
  },

  setPerspectiveEnabled(enabled) {
    set({ perspectiveEnabled: enabled })
  },

  setSeekTimeMs(timeMs) {
    set({ seekTimeMs: timeMs })
  },
}))

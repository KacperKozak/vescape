import { create } from 'zustand'

interface TargetLocation {
  latitude: number
  longitude: number
}

interface MapState {
  targetLocation: TargetLocation | null
}

interface MapActions {
  setTargetLocation: (loc: TargetLocation) => void
  clearTargetLocation: () => void
}

export const useMapStore = create<MapState & MapActions>((set) => ({
  targetLocation: null,

  setTargetLocation(loc) {
    set({ targetLocation: loc })
  },

  clearTargetLocation() {
    set({ targetLocation: null })
  },
}))

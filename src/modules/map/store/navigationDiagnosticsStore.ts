import { create } from 'zustand'
import type { LocationEvent } from 'vesc-ble'

export interface NavigationDiagnosticsState {
  gpsFix: LocationEvent | null
  retainedGpsBearingDeg: number | null
  retainedGpsBearingAt: number | null
  phoneHeadingDeg: number | null
  phoneHeadingStatus: string
  activeDisplayHeadingDeg: number | null
  cameraHeadingDeg: number | null
  fallbackReason: string | null
  updatedAt: number | null
  update: (next: NavigationDiagnosticsSnapshot) => void
}

type NavigationDiagnosticsSnapshot = Pick<
  NavigationDiagnosticsState,
  | 'gpsFix'
  | 'retainedGpsBearingDeg'
  | 'retainedGpsBearingAt'
  | 'phoneHeadingDeg'
  | 'phoneHeadingStatus'
  | 'activeDisplayHeadingDeg'
  | 'cameraHeadingDeg'
  | 'fallbackReason'
>

const INITIAL_SNAPSHOT: NavigationDiagnosticsSnapshot = {
  gpsFix: null,
  retainedGpsBearingDeg: null,
  retainedGpsBearingAt: null,
  phoneHeadingDeg: null,
  phoneHeadingStatus: 'idle',
  activeDisplayHeadingDeg: null,
  cameraHeadingDeg: null,
  fallbackReason: 'map_not_ready',
}

export const useNavigationDiagnosticsStore = create<NavigationDiagnosticsState>((set) => ({
  ...INITIAL_SNAPSHOT,
  updatedAt: null,
  update(next) {
    set({ ...next, updatedAt: Date.now() })
  },
}))

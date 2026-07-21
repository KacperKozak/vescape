import { create } from 'zustand'

/**
 * Decimated per-metric sparkline series, computed natively and pushed ~1Hz.
 * Each metric is a flat `[ts0, v0, ts1, v1, ...]` array. Center-screen sparklines
 * (and, while the perf flag is on, the `/control` detail charts) read this instead
 * of projecting/decimating the full sample window on the JS thread. Keys match
 * `LIVE_SERIES_METRICS` on the native side.
 */
interface LiveSeriesState {
  metrics: Record<string, number[]>
  generation: number
  setSeries: (metrics: Record<string, number[]>, generation: number) => void
  clear: () => void
}

const EMPTY: Record<string, number[]> = {}

export const useLiveSeriesStore = create<LiveSeriesState>((set) => ({
  metrics: EMPTY,
  generation: 0,
  setSeries: (metrics, generation) => set({ metrics, generation }),
  clear: () => set({ metrics: EMPTY, generation: 0 }),
}))

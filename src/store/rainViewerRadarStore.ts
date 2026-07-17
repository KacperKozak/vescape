import { create } from 'zustand'

const RAINVIEWER_META_URL = 'https://api.rainviewer.com/public/weather-maps.json'
const CACHE_MS = 5 * 60 * 1_000

export interface RainViewerRadarFrame {
  time: number
  path: string
}

export type RainViewerRadarTransitionMode = 'auto' | 'manual'

interface RainViewerRadarState {
  host: string | null
  frames: RainViewerRadarFrame[]
  selectedFrameIndex: number
  transitionMode: RainViewerRadarTransitionMode
  loading: boolean
  fetchedAt: number | null
}

interface RainViewerRadarActions {
  fetch: (force?: boolean) => Promise<void>
  setFrameIndex: (index: number, transitionMode?: RainViewerRadarTransitionMode) => void
  nextFrame: () => void
}

interface RainViewerMetaResponse {
  host?: string
  radar?: {
    past?: RainViewerRadarFrame[]
  }
}

function clampFrameIndex(index: number, frameCount: number): number {
  if (frameCount <= 0) return 0
  return Math.max(0, Math.min(frameCount - 1, index))
}

export function buildRainViewerTileTemplate(host: string, frame: RainViewerRadarFrame): string {
  return `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`
}

export function formatRainViewerFrameTime(time: number): string {
  return new Date(time * 1_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const useRainViewerRadarStore = create<RainViewerRadarState & RainViewerRadarActions>(
  (set, get) => ({
    host: null,
    frames: [],
    selectedFrameIndex: 0,
    transitionMode: 'auto',
    loading: false,
    fetchedAt: null,

    async fetch(force = false) {
      const state = get()
      if (!force && state.fetchedAt && Date.now() - state.fetchedAt < CACHE_MS) return
      if (state.loading) return

      set({ loading: true })
      try {
        const res = await globalThis.fetch(RAINVIEWER_META_URL)
        if (!res.ok) return

        const meta = (await res.json()) as RainViewerMetaResponse
        const host = meta.host ?? null
        const frames = meta.radar?.past ?? []
        if (!host || frames.length === 0) return

        set((current) => {
          const selectedFrameIndex =
            current.frames.length === 0
              ? frames.length - 1
              : clampFrameIndex(current.selectedFrameIndex, frames.length)

          return {
            host,
            frames,
            selectedFrameIndex,
            fetchedAt: Date.now(),
          }
        })
      } catch {
        // network errors ignored in prototype
      } finally {
        set({ loading: false })
      }
    },

    setFrameIndex(index, transitionMode = 'manual') {
      const { frames } = get()
      set({ selectedFrameIndex: clampFrameIndex(index, frames.length), transitionMode })
    },

    nextFrame() {
      const { frames, selectedFrameIndex } = get()
      if (frames.length <= 1) return
      set({ selectedFrameIndex: (selectedFrameIndex + 1) % frames.length, transitionMode: 'auto' })
    },
  }),
)

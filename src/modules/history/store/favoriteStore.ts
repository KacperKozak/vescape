import { create } from 'zustand'
import {
  createFavorite,
  deleteFavorite,
  getFavorites,
  type Favorite,
  type CreateFavoriteOptions,
} from 'vescape-core'

interface FavoriteState {
  favorites: Favorite[]
  loading: boolean
  error: string | undefined
}

interface FavoriteActions {
  load: () => Promise<void>
  /** Pin a range. Native owns identity, timestamps and stats — JS only sends range + name. */
  add: (options: CreateFavoriteOptions) => Promise<Favorite | null>
  /** Unpin. Telemetry inside the range stays (ADR 0029). */
  remove: (id: string) => Promise<void>
}

export const useFavoriteStore = create<FavoriteState & FavoriteActions>((set, get) => ({
  favorites: [],
  loading: false,
  error: undefined,

  async load() {
    set({ loading: true, error: undefined })
    try {
      set({ favorites: await getFavorites() })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async add(options) {
    set({ error: undefined })
    try {
      const favorite = await createFavorite(options)
      set({
        favorites: [favorite, ...get().favorites].sort((a, b) => b.startMs - a.startMs),
      })
      return favorite
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  async remove(id) {
    set({ error: undefined })
    try {
      await deleteFavorite(id)
      set({ favorites: get().favorites.filter((favorite) => favorite.id !== id) })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },
}))

export type { Favorite }

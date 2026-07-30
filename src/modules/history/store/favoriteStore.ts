import { create } from 'zustand'
import {
  createFavorite,
  deleteFavorite,
  getFavorites,
  updateFavorite,
  type Favorite,
  type CreateFavoriteOptions,
  type UpdateFavoriteOptions,
} from 'vescape-core'

interface FavoriteState {
  favorites: Favorite[]
  loading: boolean
  /** One create/update/delete at a time; controls must not queue a second mutation. */
  saving: boolean
  error: string | undefined
}

interface FavoriteActions {
  load: () => Promise<void>
  /** Pin a range. Native owns identity, timestamps and stats — JS only sends range + name. */
  add: (options: CreateFavoriteOptions) => Promise<Favorite | null>
  /** Re-trim/rename in place. Native preserves identity/media and recomputes the summary. */
  update: (id: string, options: UpdateFavoriteOptions) => Promise<Favorite | null>
  /** Unpin. Telemetry inside the range stays (ADR 0029). */
  remove: (id: string) => Promise<void>
}

export const useFavoriteStore = create<FavoriteState & FavoriteActions>((set, get) => ({
  favorites: [],
  loading: false,
  saving: false,
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
    if (get().saving) return null
    set({ saving: true, error: undefined })
    try {
      const favorite = await createFavorite(options)
      set({
        favorites: [favorite, ...get().favorites].sort((a, b) => b.startMs - a.startMs),
      })
      return favorite
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    } finally {
      set({ saving: false })
    }
  },

  async update(id, options) {
    if (get().saving) return null
    set({ saving: true, error: undefined })
    try {
      const updated = await updateFavorite(id, options)
      set({
        favorites: get()
          .favorites.map((favorite) => (favorite.id === id ? updated : favorite))
          .sort((a, b) => b.startMs - a.startMs),
      })
      return updated
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    } finally {
      set({ saving: false })
    }
  },

  async remove(id) {
    if (get().saving) return
    set({ saving: true, error: undefined })
    try {
      await deleteFavorite(id)
      set({ favorites: get().favorites.filter((favorite) => favorite.id !== id) })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ saving: false })
    }
  },
}))

export type { Favorite }

import { create } from 'zustand'
import {
  createMapPoint,
  deleteMapPoint,
  getNearbyMapPoints,
  getSettings,
  setDirectionPoint as persistDirectionPoint,
  setMapPointReaction as persistMapPointReaction,
  updateMapPoint,
  type MapPoint,
  type MapPointCategory,
  type MapPointPatch,
  type MapPointReaction,
} from 'vescape-core'

import { mapPointErrorMessage } from '@/modules/map/lib/mapPointErrors'
import { distanceMeters, nearbyRadiusMeters } from '@/modules/map/lib/nearbyRadius'

export type { MapPoint } from 'vescape-core'

/**
 * Personal navigation target. Not a Map Point: it is never shared, has no author and no reactions.
 * Native persists it so Group Ride presence can read it while JS is gone.
 */
export interface DirectionPoint {
  latitude: number
  longitude: number
}

interface NearbyRead {
  latitude: number
  longitude: number
  radiusMeters: number
}

/** Skip a refetch while the camera stays inside this much of the last read's radius. */
const REFETCH_MOVE_FRACTION = 0.4

interface MapState {
  /** Server truth for the last nearby read. The app keeps no durable copy. */
  mapPoints: MapPoint[]
  /** More Map Points matched than the server returned; the map is showing the nearest slice. */
  truncated: boolean
  loading: boolean
  /** Last read or write failure, in rider-facing words. Cleared by the next success. */
  error: string | null
  directionPoint: DirectionPoint | null
  selectedMapPointId: string | null
  hiddenMapPointCategories: MapPointCategory[]
  lastRead: NearbyRead | null
}

interface MapActions {
  /** Read Map Points around a camera position. Cheap to call on every map idle. */
  refreshNearby(latitude: number, longitude: number, zoom: number): Promise<void>
  /** Re-run the last nearby read, e.g. after sign-in or a foreground catch-up. */
  reload(): Promise<void>
  loadDirectionPoint(): Promise<void>
  addMapPoint(
    category: MapPointCategory,
    latitude: number,
    longitude: number,
  ): Promise<MapPoint | null>
  editMapPoint(id: string, patch: MapPointPatch): Promise<MapPoint | null>
  setMapPointReaction(id: string, reaction: MapPointReaction | null): Promise<MapPoint | null>
  removeMapPoint(id: string): Promise<boolean>
  setDirectionPoint(latitude: number, longitude: number): Promise<void>
  clearDirectionPoint(): Promise<void>
  selectMapPoint(id: string): void
  toggleMapPointSelection(id: string): void
  clearSelectedMapPoints(): void
  toggleMapPointCategoryVisibility(category: MapPointCategory): void
}

const byDistance = (a: MapPoint, b: MapPoint) =>
  a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id)

function pruneSelectedMapPointId(selectedId: string | null, mapPoints: MapPoint[]) {
  if (!selectedId) return null
  return mapPoints.some((point) => point.id === selectedId) ? selectedId : null
}

function reactionScore(reaction: MapPointReaction | null) {
  return reaction === 'up' ? 1 : reaction === 'down' ? -1 : 0
}

export const useMapStore = create<MapState & MapActions>((set, get) => {
  /**
   * One read path. Overlapping reads are dropped rather than queued: the map idles constantly, and
   * a stale answer landing after a newer one would rewrite the visible set backwards.
   */
  async function read(target: NearbyRead) {
    if (get().loading) return
    set({ loading: true, lastRead: target })
    try {
      const nearby = await getNearbyMapPoints(
        target.latitude,
        target.longitude,
        target.radiusMeters,
      )
      const mapPoints = [...nearby.items].sort(byDistance)
      set((s) => ({
        mapPoints,
        truncated: nearby.truncated,
        selectedMapPointId: pruneSelectedMapPointId(s.selectedMapPointId, mapPoints),
        loading: false,
        error: null,
      }))
    } catch (error) {
      // Nothing is cached offline (Map Points are server-owned), so the map goes empty and says so.
      // `lastRead` is dropped so a still camera retries on its next idle instead of staying empty
      // until the rider pans far enough to beat the skip heuristic.
      set({
        mapPoints: [],
        truncated: false,
        loading: false,
        lastRead: null,
        error: mapPointErrorMessage(error),
      })
    }
  }

  /**
   * The target moves on screen immediately, but native owns it — Group Ride presence reads native,
   * not this store. A failed write puts the previous target back so the two cannot disagree.
   */
  async function moveDirectionPoint(next: DirectionPoint | null) {
    const previous = get().directionPoint
    set({ directionPoint: next })
    try {
      await persistDirectionPoint(next?.latitude ?? null, next?.longitude ?? null)
    } catch (error) {
      set({ directionPoint: previous, error: mapPointErrorMessage(error) })
    }
  }

  /** One write path: run it, replace the point it answers with, surface any failure. */
  async function mutate(run: () => Promise<MapPoint>): Promise<MapPoint | null> {
    try {
      const point = await run()
      set((s) => ({
        mapPoints: s.mapPoints
          .map((candidate) => (candidate.id === point.id ? point : candidate))
          .sort(byDistance),
        error: null,
      }))
      return point
    } catch (error) {
      set({ error: mapPointErrorMessage(error) })
      return null
    }
  }

  return {
    mapPoints: [],
    truncated: false,
    loading: false,
    error: null,
    directionPoint: null,
    selectedMapPointId: null,
    hiddenMapPointCategories: [],
    lastRead: null,

    async refreshNearby(latitude, longitude, zoom) {
      const radiusMeters = nearbyRadiusMeters(zoom, latitude)
      const previous = get().lastRead
      const settled =
        previous !== null &&
        previous.radiusMeters === radiusMeters &&
        distanceMeters(previous, { latitude, longitude }) < radiusMeters * REFETCH_MOVE_FRACTION
      if (settled) return
      await read({ latitude, longitude, radiusMeters })
    },

    async reload() {
      const last = get().lastRead
      if (!last) return
      await read(last)
    },

    async loadDirectionPoint() {
      const settings = await getSettings()
      const { directionPointLatitude, directionPointLongitude } = settings
      set({
        directionPoint:
          directionPointLatitude != null && directionPointLongitude != null
            ? { latitude: directionPointLatitude, longitude: directionPointLongitude }
            : null,
      })
    },

    async addMapPoint(category, latitude, longitude) {
      try {
        const point = await createMapPoint({ category, latitude, longitude })
        set((s) => ({ mapPoints: [...s.mapPoints, point].sort(byDistance), error: null }))
        return point
      } catch (error) {
        set({ error: mapPointErrorMessage(error) })
        return null
      }
    },

    async editMapPoint(id, patch) {
      return mutate(() => updateMapPoint(id, patch))
    },

    async setMapPointReaction(id, reaction) {
      const previous = get().mapPoints.find((point) => point.id === id)
      if (!previous) return null
      if (previous.myReaction === reaction) return previous

      // Optimistic: a vote must feel instant. The server answer is not echoed back, so the score is
      // adjusted locally and reconciled by the next nearby read.
      const optimistic: MapPoint = {
        ...previous,
        myReaction: reaction,
        score: previous.score - reactionScore(previous.myReaction) + reactionScore(reaction),
      }
      set((s) => ({
        mapPoints: s.mapPoints.map((point) => (point.id === id ? optimistic : point)),
      }))

      try {
        await persistMapPointReaction(id, reaction)
        set({ error: null })
        return optimistic
      } catch (error) {
        // Only roll back if this is still the reaction on screen. A newer vote may have landed
        // while this one was in flight, and restoring `previous` would undo it.
        set((s) => ({
          mapPoints: s.mapPoints.map((point) =>
            point.id === id && point.myReaction === optimistic.myReaction ? previous : point,
          ),
          error: mapPointErrorMessage(error),
        }))
        return null
      }
    },

    async removeMapPoint(id) {
      try {
        await deleteMapPoint(id)
        set((s) => ({
          mapPoints: s.mapPoints.filter((point) => point.id !== id),
          selectedMapPointId: s.selectedMapPointId === id ? null : s.selectedMapPointId,
          error: null,
        }))
        return true
      } catch (error) {
        set({ error: mapPointErrorMessage(error) })
        return false
      }
    },

    async setDirectionPoint(latitude, longitude) {
      await moveDirectionPoint({ latitude, longitude })
    },

    async clearDirectionPoint() {
      if (!get().directionPoint) return
      await moveDirectionPoint(null)
    },

    selectMapPoint(id) {
      set((s) => (s.mapPoints.some((point) => point.id === id) ? { selectedMapPointId: id } : s))
    },

    toggleMapPointSelection(id) {
      set((s) => {
        if (!s.mapPoints.some((point) => point.id === id)) return s
        return { selectedMapPointId: s.selectedMapPointId === id ? null : id }
      })
    },

    clearSelectedMapPoints() {
      set((s) => (s.selectedMapPointId == null ? s : { selectedMapPointId: null }))
    },

    toggleMapPointCategoryVisibility(category) {
      set((s) => ({
        hiddenMapPointCategories: s.hiddenMapPointCategories.includes(category)
          ? s.hiddenMapPointCategories.filter((candidate) => candidate !== category)
          : [...s.hiddenMapPointCategories, category],
      }))
    },
  }
})

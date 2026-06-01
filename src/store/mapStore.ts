import { create } from 'zustand'
import {
  deleteMapPoint,
  getMapPoints,
  replaceDirectionMapPoint,
  upsertMapPoint,
  type MapPoint,
  type MapPointKind,
} from 'vesc-ble'

import { generateId } from '@/helpers/id'

export type { MapPoint } from 'vesc-ble'

const DIRECTION_MAP_POINT_KIND: MapPointKind = 'direction'

interface MapState {
  mapPoints: MapPoint[]
  loaded: boolean
}

interface MapActions {
  load(): Promise<void>
  saveMapPoint(kind: MapPointKind, latitude: number, longitude: number): Promise<MapPoint>
  replaceDirectionPoint(latitude: number, longitude: number): Promise<MapPoint>
  clearDirectionPoint(): Promise<void>
  removeMapPoint(id: string): Promise<void>
  getDirectionPoint(): MapPoint | null
}

const byCreatedAt = (a: MapPoint, b: MapPoint) => a.createdAt - b.createdAt

export const useMapStore = create<MapState & MapActions>((set, get) => ({
  mapPoints: [],
  loaded: false,

  async load() {
    const mapPoints = await getMapPoints()
    set({ mapPoints, loaded: true })
  },

  async saveMapPoint(kind, latitude, longitude) {
    if (kind === DIRECTION_MAP_POINT_KIND) {
      return get().replaceDirectionPoint(latitude, longitude)
    }

    const now = Date.now()
    const point: MapPoint = {
      id: generateId(),
      kind,
      latitude,
      longitude,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ mapPoints: [...s.mapPoints, point].sort(byCreatedAt) }))
    await upsertMapPoint(point)
    return point
  },

  async replaceDirectionPoint(latitude, longitude) {
    const now = Date.now()
    const existing = get().getDirectionPoint()
    const point: MapPoint = {
      id: existing?.id ?? generateId(),
      kind: DIRECTION_MAP_POINT_KIND,
      latitude,
      longitude,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    set((s) => ({
      mapPoints: [
        ...s.mapPoints.filter((candidate) => candidate.kind !== DIRECTION_MAP_POINT_KIND),
        point,
      ].sort(byCreatedAt),
    }))
    await replaceDirectionMapPoint(point)
    return point
  },

  async clearDirectionPoint() {
    const existing = get().getDirectionPoint()
    if (!existing) return
    set((s) => ({
      mapPoints: s.mapPoints.filter((point) => point.id !== existing.id),
    }))
    await deleteMapPoint(existing.id)
  },

  async removeMapPoint(id) {
    set((s) => ({ mapPoints: s.mapPoints.filter((point) => point.id !== id) }))
    await deleteMapPoint(id)
  },

  getDirectionPoint() {
    return get().mapPoints.find((point) => point.kind === DIRECTION_MAP_POINT_KIND) ?? null
  },
}))

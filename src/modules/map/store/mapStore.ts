import { create } from 'zustand'
import {
  deleteMapPoint,
  getMapPoints,
  replaceDirectionMapPoint,
  upsertMapPoint,
  type MapPoint,
  type MapPointKind,
} from 'vescape-core'

import { generateId } from '@/helpers/id'
import { isFilterableMapPointKind } from '@/modules/map/lib/mapPointVisibility'
import { deleteMapPointMedia } from '@/modules/map/store/mapPointPhotoFiles'

export type { MapPoint } from 'vescape-core'

const DIRECTION_MAP_POINT_KIND: MapPointKind = 'direction'

interface MapState {
  mapPoints: MapPoint[]
  selectedMapPointId: string | null
  hiddenMapPointKinds: MapPointKind[]
  loaded: boolean
}

interface MapActions {
  load(): Promise<void>
  saveMapPoint(kind: MapPointKind, latitude: number, longitude: number): Promise<MapPoint>
  updateMapPoint(id: string, patch: MapPointMetadataPatch): Promise<MapPoint | null>
  replaceDirectionPoint(latitude: number, longitude: number): Promise<MapPoint>
  clearDirectionPoint(): Promise<void>
  removeMapPoint(id: string): Promise<void>
  getDirectionPoint(): MapPoint | null
  selectMapPoint(id: string): void
  toggleMapPointSelection(id: string): void
  clearSelectedMapPoints(): void
  toggleMapPointKindVisibility(kind: MapPointKind): void
}

const byCreatedAt = (a: MapPoint, b: MapPoint) => a.createdAt - b.createdAt
const isSelectableMapPoint = (point: MapPoint) => point.kind !== DIRECTION_MAP_POINT_KIND
type MapPointMetadataPatch = Partial<Pick<MapPoint, 'name' | 'description' | 'media'>>

function compactText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function applyMapPointMetadata(point: MapPoint, patch: MapPointMetadataPatch): MapPoint {
  return {
    ...point,
    name: 'name' in patch ? compactText(patch.name) : (point.name ?? null),
    description:
      'description' in patch ? compactText(patch.description) : (point.description ?? null),
    media: patch.media ?? point.media ?? [],
    updatedAt: Date.now(),
  }
}

function pruneSelectedMapPointId(selectedId: string | null, mapPoints: MapPoint[]) {
  if (!selectedId) return null
  const point = mapPoints.find((candidate) => candidate.id === selectedId)
  return point && isSelectableMapPoint(point) ? selectedId : null
}

export const useMapStore = create<MapState & MapActions>((set, get) => ({
  mapPoints: [],
  selectedMapPointId: null,
  hiddenMapPointKinds: [],
  loaded: false,

  async load() {
    const mapPoints = await getMapPoints()
    set((s) => ({
      mapPoints,
      selectedMapPointId: pruneSelectedMapPointId(s.selectedMapPointId, mapPoints),
      loaded: true,
    }))
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

  async updateMapPoint(id, patch) {
    const existing = get().mapPoints.find((point) => point.id === id)
    if (!existing || !isSelectableMapPoint(existing)) return null
    const updated = applyMapPointMetadata(existing, patch)
    set((s) => ({
      mapPoints: s.mapPoints.map((point) => (point.id === id ? updated : point)).sort(byCreatedAt),
    }))
    await upsertMapPoint(updated)
    return updated
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
    const existing = get().mapPoints.find((point) => point.id === id)
    set((s) => ({
      mapPoints: s.mapPoints.filter((point) => point.id !== id),
      selectedMapPointId: s.selectedMapPointId === id ? null : s.selectedMapPointId,
    }))
    await deleteMapPoint(id)
    if (existing) deleteMapPointMedia(existing.id)
  },

  getDirectionPoint() {
    return get().mapPoints.find((point) => point.kind === DIRECTION_MAP_POINT_KIND) ?? null
  },

  selectMapPoint(id) {
    set((s) => {
      const point = s.mapPoints.find((candidate) => candidate.id === id)
      if (!point || !isSelectableMapPoint(point)) return s
      return { selectedMapPointId: id }
    })
  },

  toggleMapPointSelection(id) {
    set((s) => {
      const point = s.mapPoints.find((candidate) => candidate.id === id)
      if (!point || !isSelectableMapPoint(point)) return s
      return { selectedMapPointId: s.selectedMapPointId === id ? null : id }
    })
  },

  clearSelectedMapPoints() {
    set((s) => (s.selectedMapPointId == null ? s : { selectedMapPointId: null }))
  },

  toggleMapPointKindVisibility(kind) {
    if (!isFilterableMapPointKind(kind)) return
    set((s) => ({
      hiddenMapPointKinds: s.hiddenMapPointKinds.includes(kind)
        ? s.hiddenMapPointKinds.filter((candidate) => candidate !== kind)
        : [...s.hiddenMapPointKinds, kind],
    }))
  },
}))

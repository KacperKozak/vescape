import type { MapPointKind } from 'vesc-ble'

const ALWAYS_VISIBLE_MAP_POINT_KIND: MapPointKind = 'direction'

export function isFilterableMapPointKind(kind: MapPointKind) {
  return kind !== ALWAYS_VISIBLE_MAP_POINT_KIND
}

export function isMapPointKindVisible(kind: MapPointKind, hiddenKinds: readonly MapPointKind[]) {
  return !isFilterableMapPointKind(kind) || !hiddenKinds.includes(kind)
}

/** Kinds rendered as compact chips in the map-point placement picker. */
const COMPACT_MAP_POINT_KINDS: readonly MapPointKind[] = ['drop', 'bonk', 'nose_slide']

export function isCompactMapPointKind(kind: MapPointKind) {
  return COMPACT_MAP_POINT_KINDS.includes(kind)
}

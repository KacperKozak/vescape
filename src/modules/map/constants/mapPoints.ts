import type { MapPointCategory } from 'vescape-core'

import { theme } from '@/constants/theme'

/**
 * What a pin on the map can be: a server Map Point category, or the rider's own direction target.
 * Presentation only — the direction target is not a Map Point and never reaches the server.
 */
export type MapPinKind = MapPointCategory | 'direction'

/**
 * Photo/video attachment for a Map Point. Off: the server owns Map Points and its version one has
 * no media, so nothing captured here could reach another rider. The capture UI is kept behind this
 * flag until the server can store media.
 */
export const MAP_POINT_MEDIA_ENABLED = false

type MapPointThemeKey = 'sky' | 'green' | 'purple' | 'amber' | 'red' | 'yellow' | 'cyan'

export interface MapPointKindOption {
  kind: MapPinKind
  label: string
  themeKey: MapPointThemeKey
}

export const MAP_POINT_KIND_OPTIONS: readonly MapPointKindOption[] = [
  { kind: 'drop', label: 'Drop', themeKey: 'sky' },
  { kind: 'bonk', label: 'Bonk', themeKey: 'amber' },
  { kind: 'nose_slide', label: 'Nose slide', themeKey: 'purple' },
  { kind: 'trail_entry', label: 'Trail entry', themeKey: 'cyan' },
  { kind: 'viewpoint', label: 'Viewpoint', themeKey: 'yellow' },
  { kind: 'charging', label: 'Charging', themeKey: 'cyan' },
  { kind: 'direction', label: 'Direction point', themeKey: 'green' },
] as const

/** Categories a rider can place and filter; the direction target is neither. */
export const FILTERABLE_MAP_POINT_KIND_OPTIONS = MAP_POINT_KIND_OPTIONS.filter(
  (option): option is MapPointKindOption & { kind: MapPointCategory } =>
    option.kind !== 'direction',
)

const MAP_POINT_OPTIONS_BY_KIND = new Map(
  MAP_POINT_KIND_OPTIONS.map((option) => [option.kind, option]),
)

export function getMapPointKindColor(kind: MapPinKind) {
  const key = MAP_POINT_OPTIONS_BY_KIND.get(kind)?.themeKey ?? MAP_POINT_KIND_OPTIONS[0].themeKey
  return theme.palette[key].color
}

export function getMapPointKindTextColor(kind: MapPinKind) {
  const key = MAP_POINT_OPTIONS_BY_KIND.get(kind)?.themeKey ?? MAP_POINT_KIND_OPTIONS[0].themeKey
  return theme.palette[key].text
}

export function getMapPointKindLabel(kind: MapPinKind) {
  return MAP_POINT_OPTIONS_BY_KIND.get(kind)?.label ?? MAP_POINT_KIND_OPTIONS[0].label
}

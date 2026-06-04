import type { MapPointKind } from 'vesc-ble'

import { theme } from '@/constants/theme'

type MapPointThemeKey =
  | 'bran'
  | 'wheel'
  | 'gps'
  | 'target'
  | 'warning'
  | 'error'
  | 'highlight'
  | 'teal'

export interface MapPointKindOption {
  kind: MapPointKind
  label: string
  themeKey: MapPointThemeKey
}

export const MAP_POINT_KIND_OPTIONS: readonly MapPointKindOption[] = [
  { kind: 'drop', label: 'Drop', themeKey: 'wheel' },
  { kind: 'bonk', label: 'Bonk', themeKey: 'warning' },
  { kind: 'nose_slide', label: 'Nose slide', themeKey: 'target' },
  { kind: 'trail_entry', label: 'Trail entry', themeKey: 'teal' },
  { kind: 'viewpoint', label: 'Viewpoint', themeKey: 'highlight' },
  { kind: 'charging', label: 'Charging', themeKey: 'bran' },
  { kind: 'direction', label: 'Direction point', themeKey: 'gps' },
] as const

export const FILTERABLE_MAP_POINT_KIND_OPTIONS = MAP_POINT_KIND_OPTIONS.filter(
  (option) => option.kind !== 'direction',
)

const MAP_POINT_OPTIONS_BY_KIND = new Map(
  MAP_POINT_KIND_OPTIONS.map((option) => [option.kind, option]),
)

export function getMapPointKindColor(kind: MapPointKind) {
  return theme[MAP_POINT_OPTIONS_BY_KIND.get(kind)?.themeKey ?? MAP_POINT_KIND_OPTIONS[0].themeKey]
    .color
}

export function getMapPointKindTextColor(kind: MapPointKind) {
  return theme[MAP_POINT_OPTIONS_BY_KIND.get(kind)?.themeKey ?? MAP_POINT_KIND_OPTIONS[0].themeKey]
    .text
}

export function getMapPointKindLabel(kind: MapPointKind) {
  return MAP_POINT_OPTIONS_BY_KIND.get(kind)?.label ?? MAP_POINT_KIND_OPTIONS[0].label
}

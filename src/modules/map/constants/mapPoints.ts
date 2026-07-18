import type { MapPointKind } from 'vesc-ble'

import { theme } from '@/constants/theme'

type MapPointThemeKey = 'sky' | 'green' | 'purple' | 'amber' | 'red' | 'yellow' | 'cyan'

export interface MapPointKindOption {
  kind: MapPointKind
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

export const FILTERABLE_MAP_POINT_KIND_OPTIONS = MAP_POINT_KIND_OPTIONS.filter(
  (option) => option.kind !== 'direction',
)

const MAP_POINT_OPTIONS_BY_KIND = new Map(
  MAP_POINT_KIND_OPTIONS.map((option) => [option.kind, option]),
)

export function getMapPointKindColor(kind: MapPointKind) {
  const key = MAP_POINT_OPTIONS_BY_KIND.get(kind)?.themeKey ?? MAP_POINT_KIND_OPTIONS[0].themeKey
  return theme.palette[key].color
}

export function getMapPointKindTextColor(kind: MapPointKind) {
  const key = MAP_POINT_OPTIONS_BY_KIND.get(kind)?.themeKey ?? MAP_POINT_KIND_OPTIONS[0].themeKey
  return theme.palette[key].text
}

export function getMapPointKindLabel(kind: MapPointKind) {
  return MAP_POINT_OPTIONS_BY_KIND.get(kind)?.label ?? MAP_POINT_KIND_OPTIONS[0].label
}

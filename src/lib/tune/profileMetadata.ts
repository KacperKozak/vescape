export const DEFAULT_TUNE_PROFILE_ICON = 'sliders-horizontal'
export const DEFAULT_TUNE_PROFILE_COLOR = 'purple'

export const TUNE_PROFILE_ICON_IDS = [
  DEFAULT_TUNE_PROFILE_ICON,
  'faders',
  'lightning',
  'mountains',
  'road-horizon',
  'rocket-launch',
  'gauge',
  'wave-sine',
  'snowflake',
  'sun-horizon',
  'battery-charging',
  'compass',
  'fire',
  'flag-checkered',
  'gear-six',
  'heartbeat',
  'leaf',
  'shield-check',
  'sparkle',
  'target',
  'tire',
  'wind',
  'wrench',
] as const

export const TUNE_PROFILE_COLOR_IDS = [
  DEFAULT_TUNE_PROFILE_COLOR,
  'cyan',
  'sky',
  'green',
  'amber',
  'orange',
  'red',
  'yellow',
  'blue',
  'fuchsia',
  'pink',
  'violet',
] as const

export type TuneProfileIconId = (typeof TUNE_PROFILE_ICON_IDS)[number]
export type TuneProfileColorId = (typeof TUNE_PROFILE_COLOR_IDS)[number]

export function tuneProfileIconId(value: string | null | undefined): TuneProfileIconId {
  return TUNE_PROFILE_ICON_IDS.includes(value as TuneProfileIconId)
    ? (value as TuneProfileIconId)
    : DEFAULT_TUNE_PROFILE_ICON
}

export function tuneProfileColorId(value: string | null | undefined): TuneProfileColorId {
  return TUNE_PROFILE_COLOR_IDS.includes(value as TuneProfileColorId)
    ? (value as TuneProfileColorId)
    : DEFAULT_TUNE_PROFILE_COLOR
}

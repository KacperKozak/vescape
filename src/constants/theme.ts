/**
 * Semantic color tokens for VibeWheel.
 *
 * New structure:
 *   - palette: named hue swatches + mono + slate (surface/text scale + map buildings)
 *   - telemetry: single-color token per metric
 *   - map: user/target/building colors
 *   - status: semantic UI-state tokens (info/success/warning/error/favorite)
 *   - alpha: typed opacity helper for every translucent value
 *
 * Never hardcode a color that belongs to one of these categories directly in a
 * component. Add new tokens here first, then reference them via theme.*.
 */

/** Allowed opacity levels for every translucent color value. */
export type AlphaLevel = 0 | 0.12 | 0.3 | 0.6 | 0.85

function alpha(color: string, level: AlphaLevel): string {
  'worklet'
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const [r, g, b] =
      hex.length === 3
        ? [
            Number.parseInt(hex[0] + hex[0], 16),
            Number.parseInt(hex[1] + hex[1], 16),
            Number.parseInt(hex[2] + hex[2], 16),
          ]
        : [
            Number.parseInt(hex.slice(0, 2), 16),
            Number.parseInt(hex.slice(2, 4), 16),
            Number.parseInt(hex.slice(4, 6), 16),
          ]
    return `rgba(${r},${g},${b},${level})`
  }

  if (color.startsWith('rgba')) {
    return color.replace(/,[^,]+\)$/, `,${level})`)
  }

  if (color.startsWith('rgb')) {
    return color.replace(')', `,${level})`).replace('rgb', 'rgba')
  }

  throw new Error(`Unsupported color format for alpha(): ${color}`)
}

type Hue = {
  color: string
  /** Alternate shade within the same hue — aliases `light`. */
  alt: string
  light: string
  text: string
  bg: string
  border: string
}

function hue(color: string, light: string, text: string, bg: string, border: string): Hue {
  return { color, alt: light, light, text, bg, border }
}

export const palette = {
  mono: {
    black: '#000000',
    white: '#ffffff',
  },

  slate: {
    ...hue('#64748b', '#94a3b8', '#cbd5e1', '#1e293b', '#334155'),
    bg: '#111827',
    surface: '#1e293b',
    surfaceDeep: '#0f172a',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textDim: '#475569',
    mapBuildingDark: '#3e4451',
    mapBuildingLight: '#e5e7eb',
  },

  // Board / primary data — original `wheel`
  sky: {
    ...hue('#38bdf8', '#7dd3fc', '#7dd3fc', '#0c2a3f', '#0369a1'),
    snow: '#bae6fd',
  },
  // Brand / primary accents — original `bran`
  cyan: hue('#06b6d4', '#67e8f9', '#67e8f9', '#083344', '#0e7490'),
  // Currents / info — original motorCurrent/battCurrent/banner-info
  blue: hue('#60a5fa', '#818cf8', '#bfdbfe', '#0f1d2e', '#1e3a5f'),
  // GPS / Android / success — original `gps`
  green: hue('#22c55e', '#4ade80', '#4ade80', '#14532d', '#15803d'),
  // Energy / database — original `warning` non-warning usage
  amber: hue('#f59e0b', '#fbbf24', '#fde68a', '#451a03', '#92400e'),
  // Temperatures — original `warning` color
  orange: hue('#f97316', '#fb923c', '#fdba74', '#431407', '#9a3412'),
  // Errors — original `error`
  red: hue('#ef4444', '#f87171', '#fca5a5', '#7f1d1d', '#991b1b'),
  // Stars / achievements / gauges — original `highlight`
  yellow: hue('#facc15', '#fde047', '#fde047', '#422006', '#854d0e'),
  // Time / iOS / profiles / pitch — original `target`
  purple: {
    ...hue('#a855f7', '#a78bfa', '#d8b4fe', '#1e1338', '#7e22ce'),
    thunder: '#c084fc',
  },
  // Roll / balance pitch — original roll/balancePitch
  fuchsia: hue('#c084fc', '#e879f9', '#f0abfc', '#4a0444', '#a21caf'),
  // Map trail / marker accents
  violet: {
    ...hue('#7c6fef', '#8b5cf6', '#a78bfa', '#2e1065', '#5b21b6'),
    moon: '#a78bfa',
  },
  // Secondary data / duty — original `teal`
  teal: hue('#14b8a6', '#2dd4bf', '#99f6e4', '#042f2e', '#0f766e'),
  // Group rides — sea, pushed a touch greener
  groupRide: hue('#10c69a', '#5eead4', '#7af0d6', '#04302a', '#0c8f74'),
  // Balance pitch alternate — kept for pink family completeness
  pink: hue('#ec4899', '#f472b6', '#fbcfe8', '#500724', '#be185d'),
} as const

export const telemetry = {
  speed: palette.sky.color,
  duty: palette.teal.color,
  motorCurrent: palette.blue.light,
  battCurrent: palette.blue.color,
  controllerTemp: palette.orange.color,
  motorTemp: palette.red.color,
  battVoltage: palette.green.light,
  footpad1: palette.slate.light,
  footpad2: palette.slate.color,
  pitch: palette.purple.light,
  roll: palette.fuchsia.color,
  balancePitch: palette.fuchsia.light,
} as const

export const map = {
  user: palette.purple.color,
  target: palette.green.color,
  buildingDark: palette.slate.mapBuildingDark,
  buildingLight: palette.slate.mapBuildingLight,
} as const

export const status = {
  info: {
    color: palette.blue.color,
    text: palette.blue.text,
    bg: palette.blue.bg,
    border: palette.blue.border,
  },
  success: {
    color: palette.green.color,
    text: palette.green.text,
    bg: palette.green.bg,
    border: palette.green.border,
  },
  warning: {
    color: palette.orange.color,
    text: palette.orange.text,
    bg: palette.orange.bg,
    border: palette.orange.border,
  },
  error: {
    color: palette.red.color,
    text: palette.red.text,
    bg: palette.red.bg,
    border: palette.red.border,
  },
  favorite: {
    color: palette.yellow.color,
    text: palette.yellow.text,
    bg: palette.yellow.bg,
    border: palette.yellow.border,
  },
} as const

/** Banner callouts — flat row, accent icon + neutral text. */
export const banner = {
  info: { icon: status.info.color },
  warning: { icon: status.warning.color },
  error: { icon: status.error.color },
} as const

/** Weather condition icon colors — derived from palette. */
export const weather = {
  sun: palette.amber.light,
  partly: palette.amber.color,
  moon: palette.violet.moon,
  moonPartly: palette.violet.color,
  cloud: palette.slate.light,
  fog: palette.slate.text,
  rain: palette.blue.color,
  snow: palette.sky.snow,
  thunder: palette.purple.thunder,
} as const

/** Privacy zone tints — derived from palette via alpha(). */
export const zone = {
  bg: alpha(palette.green.color, 0.12),
  border: alpha(palette.green.color, 0.6),
  borderDim: alpha(palette.slate.color, 0.6),
} as const

/** Shared press/touch interaction tokens. */
export const interaction = {
  /** Android ripple for bounded pressables (cards, cells). */
  ripple: { color: alpha(palette.slate.light, 0.12), borderless: false, foreground: true },
  /** Android ripple for icon-only pressables with no visible bounds. */
  rippleBorderless: { color: alpha(palette.slate.light, 0.12), borderless: true, foreground: true },
  /** iOS/cross-platform pressed background for list rows and sheet items. */
  pressedBg: palette.slate.surface,
  /** iOS/cross-platform pressed opacity for metric cells and icon buttons. */
  pressedOpacity: 0.55,
} as const

export const theme = {
  palette,
  telemetry,
  map,
  status,
  alpha,
  banner,
  weather,
  zone,
  interaction,
} as const

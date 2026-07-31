import type { ResolvedTheme } from '@/constants/theme'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface MapThemeTone {
  imageryOpacity: number
  imagerySaturation: number
  imageryContrast: number
  roadLineOpacity: number
}

/** Reconciles manual satellite controls with a gradual daylight/theme adjustment. */
export function resolveMapThemeTone({
  theme,
  outdoorLight,
  imageryOpacity,
  imagerySaturation,
}: {
  theme: ResolvedTheme
  outdoorLight: number
  imageryOpacity: number
  imagerySaturation: number
}): MapThemeTone {
  const daylight = clamp(outdoorLight, 0, 1)
  const opacityFactor = theme === 'dark' ? 0.55 + daylight * 0.2 : 0.78 + daylight * 0.12
  const saturationAdjustment = theme === 'dark' ? -0.35 + daylight * 0.2 : -0.2 + daylight * 0.1

  return {
    imageryOpacity: clamp(imageryOpacity * opacityFactor, 0.1, 1),
    imagerySaturation: clamp(imagerySaturation + saturationAdjustment, -1, 1),
    imageryContrast: theme === 'dark' ? -0.3 + daylight * 0.08 : -0.15 + daylight * 0.05,
    roadLineOpacity: theme === 'dark' ? 0.45 + daylight * 0.2 : 0.7 + daylight * 0.05,
  }
}

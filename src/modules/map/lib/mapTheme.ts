import type { MapStyleKey } from '@/modules/map/constants/mapStyles'
import type { ResolvedTheme } from '@/constants/theme'

/** Only basemaps with an explicit appearance temporarily override the app theme. */
export function themeOverrideForMapStyle(style: MapStyleKey): ResolvedTheme | null {
  if (style === 'onedark') return 'dark'
  if (style === 'outdoors') return 'light'
  return null
}

import { theme } from '@/constants/theme'

/** Shared translucent surface shared by every widget. */
export const widgetSurface = {
  backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  borderColor: theme.palette.slate.border,
  borderWidth: 1,
  borderRadius: 18,
} as const

/**
 * Footprint a widget occupies in the 4-column widget grid:
 *   - `square` → 1×1 icon tile (aspect-1)
 *   - `half`   → 1×2 compact row
 *   - `full`   → 1×4 full-width row (default)
 */
export type WidgetSize = 'square' | 'half' | 'full'

import { theme } from '@/constants/theme'

/** Shared translucent surface shared by every widget. */
export const widgetSurface = {
  backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  borderColor: theme.palette.slate.border,
  borderWidth: 1,
  borderRadius: 18,
} as const

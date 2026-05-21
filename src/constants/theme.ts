/**
 * Semantic color palette for VibeWheel.
 *
 * Each entry covers four use-cases:
 *   color  – the primary/fill shade (icons, accents, highlights)
 *   bg     – dark tinted background (pills, cards, badges)
 *   text   – readable text on a dark background
 *   border – subtle border / divider
 *
 * Add new semantic entries here as needed. Never hardcode a color that
 * belongs to one of these categories directly in a component.
 */
export const theme = {
  /** Brand / primary – modern turquoise */
  bran: {
    color: '#06b6d4', // cyan-500
    bg: '#083344',
    text: '#67e8f9', // cyan-300
    border: '#0e7490', // cyan-700
  },

  /** Wheel / board data – lightning blue */
  wheel: {
    color: '#38bdf8', // sky-400
    bg: '#0c2a3f',
    text: '#7dd3fc', // sky-300
    border: '#0369a1', // sky-700
  },

  /** GPS signal – grass green */
  gps: {
    color: '#22c55e', // green-500
    bg: '#14532d', // green-900
    text: '#4ade80', // green-400
    border: '#15803d', // green-700
  },

  /** Target location – purple */
  target: {
    color: '#a855f7', // purple-500
    bg: '#1e1338',
    text: '#d8b4fe', // purple-200
    border: '#7e22ce', // purple-800
  },

  /** Warning state – orange */
  warning: {
    color: '#f97316', // orange-500
    bg: '#431407',
    text: '#fb923c', // orange-400
    border: '#9a3412', // orange-800
  },

  /** Error state – red */
  error: {
    color: '#ef4444', // red-500
    bg: '#7f1d1d', // red-900
    text: '#f87171', // red-400
    border: '#991b1b', // red-800
  },
} as const

/** Shared press/touch interaction tokens. Use these on every Pressable to keep feedback uniform. */
export const interaction = {
  /** Android ripple for bounded pressables (cards, cells). */
  ripple: { color: 'rgba(148,163,184,0.18)', borderless: false, foreground: true },
  /** Android ripple for icon-only pressables with no visible bounds. */
  rippleBorderless: { color: 'rgba(148,163,184,0.18)', borderless: true, foreground: true },
  /** iOS/cross-platform pressed background for list rows and sheet items. */
  pressedBg: '#253548',
  /** iOS/cross-platform pressed opacity for metric cells and icon buttons. */
  pressedOpacity: 0.55,
} as const

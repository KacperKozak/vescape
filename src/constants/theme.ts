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

  /** Highlight / star – yellow */
  highlight: {
    color: '#facc15', // yellow-400
    bg: '#422006', // yellow-950
    text: '#fde047', // yellow-300
    border: '#854d0e', // yellow-700
  },

  /** Secondary data – teal */
  teal: {
    color: '#14b8a6', // teal-500
    bg: '#042f2e', // teal-950
    text: '#2dd4bf', // teal-400
    border: '#0f766e', // teal-700
  },

  /** Banner callouts – info, warning, error */
  banner: {
    info: {
      bg: '#0f1d2e',
      border: '#1e3a5f',
      icon: '#60a5fa', // blue-400
      title: '#60a5fa', // blue-400
      message: '#bfdbfe', // blue-200
    },
    warning: {
      bg: '#2a1a0f',
      border: '#78350f',
      icon: '#f59e0b', // amber-500
      title: '#f59e0b', // amber-500
      message: '#fde68a', // amber-200
    },
    error: {
      bg: '#2a0f0f',
      border: '#7f1d1d',
      icon: '#ef4444', // red-500
      title: '#ef4444', // red-500
      message: '#fecaca', // red-200
    },
  },

  /** Weather condition icons */
  weather: {
    sun: '#fbbf24', // amber-400
    partly: '#f59e0b', // amber-500
    moon: '#a78bfa', // violet-400
    moonPartly: '#7c3aed', // violet-600
    cloud: '#94a3b8', // slate-400
    fog: '#cbd5e1', // slate-300
    rain: '#60a5fa', // blue-400
    snow: '#bae6fd', // sky-200
    thunder: '#c084fc', // purple-400
  },

  /** Neutral palette – surfaces, text, borders, structure. Max 2 levels deep. */
  neutral: {
    bg: '#111827',
    surface: '#1e293b',
    surfaceDeep: '#0f172a',
    border: '#334155',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textDim: '#475569',
    /** Semi-transparent overlays and map component backgrounds. */
    mapOverlayPin: 'rgba(15,23,42,0.58)',
    mapOverlayPill: 'rgba(15,23,42,0.72)',
    mapOverlaySelector: 'rgba(15,23,42,0.9)',
    dimOverlay: 'rgba(0,0,0,0.3)',
    modalBackdrop: 'rgba(0,0,0,0.6)',
    loadingOverlay: 'rgba(17,24,39,0.6)',
    textShadow: 'rgba(0,0,0,0.8)',
    textDimLight: 'rgba(255,255,255,0.55)',
    borderMuted: 'rgba(148,163,184,0.28)',
    touchInvisible: 'rgba(0,0,0,0.001)',
    transparent: 'rgba(0,0,0,0)',
    routeHighlight: 'rgba(255,255,255,0.98)',
    routeHighlightTransparent: 'rgba(255,255,255,0)',
    mapBuildingDark: '#3e4451',
    mapBuildingLight: '#e5e7eb',
  },
  /** Privacy zone colors – green GPS zone markers. */
  zone: {
    bg: 'rgba(34,197,94,0.18)',
    border: 'rgba(34,197,94,0.70)',
    borderDim: 'rgba(100,116,139,0.50)',
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

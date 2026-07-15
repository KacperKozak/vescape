import type { BoardWarning, BoardWarningKind, BoardWarningSeverity } from 'vesc-ble'

/**
 * Rider-facing titles per Board Warning kind. Keyed by the exhaustive `BoardWarningKind` union, so adding a
 * native kind without a title here is a compile error rather than a warning that renders as a raw slug.
 */
const WARNING_TITLES: Record<BoardWarningKind, string> = {
  'cell-spread': 'Cell voltage spread',
  'battery-config-mismatch': 'Battery config mismatch',
  'footpad-disabled': 'Footpad sensor disabled',
  'lv-pushback-low': 'Low-voltage pushback too low',
  'hv-pushback-high': 'High-voltage pushback too high',
  'duty-pushback-high': 'Duty pushback too high',
  'moving-fault-disabled': 'Moving-fault protection off',
}

/**
 * Human title for a warning kind, falling back to the raw kind for unknown detectors (a newer native build
 * may emit a kind this app version does not know).
 */
export function warningTitle(kind: string): string {
  return WARNING_TITLES[kind as BoardWarningKind] ?? kind
}

/** Worst active severity across a board's warnings, or null when there are none. */
export function worstSeverity(warnings: BoardWarning[]): BoardWarningSeverity | null {
  if (warnings.length === 0) return null
  return warnings.some((w) => w.severity === 'critical') ? 'critical' : 'warn'
}

export interface WarningDetailEntry {
  label: string
  value: string
}

/**
 * Generic payload rendering: decode a warning's kind-specific JSON payload into label/value detail
 * rows. Detector slices carry richer payloads; this renders whatever object keys are present until a
 * kind opts into bespoke detail text.
 */
export function parseWarningDetail(payloadJson: string): WarningDetailEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(payloadJson)
  } catch {
    return []
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
    label: humanizeKey(key),
    value: formatValue(value),
  }))
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

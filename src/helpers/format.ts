/** Em dash used as placeholder when a value is unavailable. */
export const DASH = '—'

/** Format a number to a fixed number of decimal places (default 1). */
export function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals)
}

/** Format a speed value as absolute km/h with one decimal. */
export function fmtSpeed(kmh: number): string {
  return Math.abs(kmh).toFixed(1)
}

/** Format metres as kilometres (two decimals), returning '—' for null/undefined. */
export function fmtKm(metres: number | null | undefined): string {
  if (metres == null) return '—'
  return (metres / 1000).toFixed(2)
}

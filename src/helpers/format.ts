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

const DUTY_IDLE_DEADBAND = 0.01

/** Convert a duty-cycle fraction to display percent, hiding the ±1% idle quantization. */
export function dutyPercent(dutyCycle: number, absolute = true): number {
  if (Math.abs(dutyCycle) <= DUTY_IDLE_DEADBAND) return 0
  const value = dutyCycle * 100
  return absolute ? Math.abs(value) : value
}

/** Format a duty-cycle fraction as a whole percent label. */
export function fmtDutyPercent(dutyCycle: number, absolute = true): string {
  return `${dutyPercent(dutyCycle, absolute).toFixed(0)}%`
}

/** Format metres as kilometres (two decimals), returning '—' for null/undefined. */
export function fmtKm(metres: number | null | undefined): string {
  if (metres == null) return '—'
  return (metres / 1000).toFixed(2)
}

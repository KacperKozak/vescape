/** Em dash used as placeholder when a value is unavailable. */
export const DASH = '—'

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

/** Format voltage: drop trailing .0 (e.g. 84.0 → "84", 3.7 → "3.7"). */
function fmtVoltage(v: number): string {
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)
}

/** Format a voltage range: "60–84 V" or "3.2–4.2 V". */
export function fmtVoltageRange(min: number, max: number): string {
  return `${fmtVoltage(min)}–${fmtVoltage(max)} V`
}

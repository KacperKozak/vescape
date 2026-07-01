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

/** Format a distance in meters as "240 m" below 1 km, else "1.2 km". */
export function fmtDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

/** Compact "time since" label: "12s", "3m", "2h", "5d" from an epoch-ms timestamp. */
export function fmtSince(timestampMs: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - timestampMs) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** Format bytes to human-readable string (B, KB, MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

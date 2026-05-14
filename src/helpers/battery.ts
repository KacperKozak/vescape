/**
 * Generic Li-ion / LiPo discharge curve, normalized.
 * Works for any cell count: pack voltage normalized to [0..1] across [minV..maxV],
 * then mapped through this curve. Curve is the typical 18650 shape (sagging at
 * low SoC, plateau in the middle), expressed in normalized form.
 *
 * Each entry: { v: normalized voltage 0..1, soc: state-of-charge percent 0..100 }.
 * Sorted DESC by voltage. Linear interpolation between points.
 */
const CURVE: { v: number; soc: number }[] = [
  { v: 1.0, soc: 100 },
  { v: 0.95, soc: 90 },
  { v: 0.9, soc: 75 },
  { v: 0.82, soc: 55 },
  { v: 0.72, soc: 35 },
  { v: 0.55, soc: 18 },
  { v: 0.35, soc: 7 },
  { v: 0.15, soc: 2 },
  { v: 0.0, soc: 0 },
]

/**
 * Estimate battery state-of-charge percent (0..100) from pack voltage and the
 * configured min/max voltages of the pack.
 *
 * Returns null if min/max are missing or invalid.
 */
export function estimateBatteryPercent(
  voltage: number,
  minVoltage: number | null,
  maxVoltage: number | null,
): number | null {
  if (minVoltage == null || maxVoltage == null) return null
  if (maxVoltage <= minVoltage) return null

  const norm = (voltage - minVoltage) / (maxVoltage - minVoltage)
  if (norm >= 1) return 100
  if (norm <= 0) return 0

  for (let i = 0; i < CURVE.length - 1; i++) {
    const hi = CURVE[i]
    const lo = CURVE[i + 1]
    if (norm <= hi.v && norm >= lo.v) {
      const span = hi.v - lo.v
      const t = span > 0 ? (norm - lo.v) / span : 0
      return lo.soc + t * (hi.soc - lo.soc)
    }
  }
  return 0
}

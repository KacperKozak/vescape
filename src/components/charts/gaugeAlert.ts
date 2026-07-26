/** Threshold marker rendered on gauge scales (linear and dual). */
export interface DualGaugeAlert {
  id: string
  threshold: number
  thresholdMax: number | null
  /** Optional numeric label drawn at the `threshold` tick (e.g. `20%`, `38 km/h`). */
  label?: string
  /** Optional numeric label drawn at the `thresholdMax` tick of a range marker. */
  labelMax?: string
}

/** Threshold marker rendered on gauge scales (linear and dual). */
export interface DualGaugeAlert {
  id: string
  threshold: number
  thresholdMax: number | null
}

/**
 * Δt-aware exponential moving average over an irregularly-sampled series.
 *
 * y[i] = y[i-1] + α · (x[i] − y[i-1])
 * α    = 1 − exp(−Δt / τ),  τ = halfLifeMs / ln(2)
 *
 * Because α is computed from each sample's actual time delta, a gap in the
 * input (BLE drop, replay, app pause) does not produce a misleading spike —
 * the filter "catches up" proportionally to the elapsed time.
 *
 * Use case: smooth out battery-voltage sag during heavy current draw so the
 * displayed pack voltage / SoC % reflects the slow underlying trend rather
 * than per-packet load jitter.
 */
export interface TimedSample {
  ts: number
  value: number
}

export function emaSeries<T extends TimedSample>(samples: T[], halfLifeMs: number): T[] {
  if (samples.length === 0 || halfLifeMs <= 0) return samples
  const tau = halfLifeMs / Math.LN2
  const out: T[] = []
  let prevValue = samples[0].value
  let prevTs = samples[0].ts
  out.push({ ...samples[0], value: prevValue })
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]
    const dt = Math.max(0, s.ts - prevTs)
    const alpha = 1 - Math.exp(-dt / tau)
    prevValue = prevValue + alpha * (s.value - prevValue)
    prevTs = s.ts
    out.push({ ...s, value: prevValue })
  }
  return out
}

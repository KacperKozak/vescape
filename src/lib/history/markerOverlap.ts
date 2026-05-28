import type { HistoryGpsSample, HistoryMarker } from '@/store/historyStore'
import { findNearestSampleIndexByTime } from './playback'

export interface MarkerRenderData {
  marker: HistoryMarker
  gps: HistoryGpsSample
  renderCoordinate: [number, number]
}

const OFFSET_DEGREES = 0.00004

export function resolveMarkerRenderData(
  markers: HistoryMarker[],
  gpsSamples: HistoryGpsSample[],
): MarkerRenderData[] {
  const resolved: { marker: HistoryMarker; gps: HistoryGpsSample; sampleIdx: number }[] = []
  for (const marker of markers) {
    const idx = findNearestSampleIndexByTime(gpsSamples, marker.occurredAtMs)
    const gps = idx >= 0 ? gpsSamples[idx] : null
    if (!gps) continue
    resolved.push({ marker, gps, sampleIdx: idx })
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < resolved.length; i++) {
    const key = resolved[i].sampleIdx
    const list = groups.get(key)
    if (list) list.push(i)
    else groups.set(key, [i])
  }

  const result: MarkerRenderData[] = []
  for (const [, indices] of groups) {
    if (indices.length === 1) {
      const { marker, gps } = resolved[indices[0]]
      result.push({ marker, gps, renderCoordinate: [gps.longitude, gps.latitude] })
      continue
    }

    const { gps: center } = resolved[indices[0]]
    const step = (2 * Math.PI) / indices.length
    for (let i = 0; i < indices.length; i++) {
      const { marker, gps } = resolved[indices[i]]
      const angle = step * i - Math.PI / 2
      result.push({
        marker,
        gps,
        renderCoordinate: [
          center.longitude + OFFSET_DEGREES * Math.cos(angle),
          center.latitude + OFFSET_DEGREES * Math.sin(angle),
        ],
      })
    }
  }

  return result
}

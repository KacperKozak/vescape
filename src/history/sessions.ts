import type { TelemetryHistoryBlock } from 'vesc-ble'

const DEFAULT_GAP_MS = 10 * 60_000
const SESSION_BREAK_BOUNDARIES = new Set(['disconnected', 'app_stop', 'error'])

export interface HistorySession {
  id: string
  deviceId: string | null
  deviceName: string
  startAtMs: number
  endAtMs: number
  blockIds: string[]
  blockCount: number
  sampleCount: number
  gpsPointCount: number
  preciseGpsPointCount: number
  distanceM: number | null
  maxSpeedKmh: number
  avgSpeedKmh: number
  faultCount: number
  boundaryBefore: TelemetryHistoryBlock['boundaryBefore']
}

interface MutableSessionAggregate {
  deviceId: string | null
  deviceName: string
  boundaryBefore: TelemetryHistoryBlock['boundaryBefore']
  startAtMs: number
  endAtMs: number
  blockIds: string[]
  blockCount: number
  sampleCount: number
  gpsPointCount: number
  preciseGpsPointCount: number
  distanceDeltaSum: number
  gpsDistanceSum: number
  distanceDeltaCount: number
  gpsDistanceCount: number
  maxSpeedKmh: number
  weightedSpeedSum: number
  weightedSpeedCount: number
  avgSpeedFallbackSum: number
  avgSpeedFallbackCount: number
  faultCount: number
}

export function groupHistorySessions(
  blocks: TelemetryHistoryBlock[],
  options?: { gapMs?: number },
): HistorySession[] {
  if (!blocks.length) return []
  const gapMs = options?.gapMs ?? DEFAULT_GAP_MS
  const oldestFirst = [...blocks].reverse()
  const sessions: MutableSessionAggregate[] = []
  let current: MutableSessionAggregate | null = null
  let previousBlock: TelemetryHistoryBlock | null = null

  for (const block of oldestFirst) {
    const breakByDevice = !current || current.deviceId !== block.deviceId
    const breakByGap = !!previousBlock && block.startAtMs - previousBlock.endAtMs > gapMs
    const breakByBoundary = SESSION_BREAK_BOUNDARIES.has(block.boundaryBefore)

    if (!current || breakByDevice || breakByGap || breakByBoundary) {
      if (current) sessions.push(current)
      current = createAggregate(block)
    } else {
      mergeBlockIntoAggregate(current, block)
    }

    previousBlock = block
  }

  if (current) sessions.push(current)

  return sessions.map(finalizeSession).sort((a, b) => b.startAtMs - a.startAtMs)
}

function createAggregate(block: TelemetryHistoryBlock): MutableSessionAggregate {
  const aggregate: MutableSessionAggregate = {
    deviceId: block.deviceId,
    deviceName: block.deviceName,
    boundaryBefore: block.boundaryBefore,
    startAtMs: block.startAtMs,
    endAtMs: block.endAtMs,
    blockIds: [],
    blockCount: 0,
    sampleCount: 0,
    gpsPointCount: 0,
    preciseGpsPointCount: 0,
    distanceDeltaSum: 0,
    gpsDistanceSum: 0,
    distanceDeltaCount: 0,
    gpsDistanceCount: 0,
    maxSpeedKmh: 0,
    weightedSpeedSum: 0,
    weightedSpeedCount: 0,
    avgSpeedFallbackSum: 0,
    avgSpeedFallbackCount: 0,
    faultCount: 0,
  }
  mergeBlockIntoAggregate(aggregate, block)
  return aggregate
}

function mergeBlockIntoAggregate(
  session: MutableSessionAggregate,
  block: TelemetryHistoryBlock,
): void {
  session.startAtMs = Math.min(session.startAtMs, block.startAtMs)
  session.endAtMs = Math.max(session.endAtMs, block.endAtMs)
  session.blockIds.push(block.id)
  session.blockCount += 1
  session.sampleCount += block.sampleCount
  session.gpsPointCount += block.gpsPointCount
  session.preciseGpsPointCount += block.preciseGpsPointCount
  session.faultCount += block.faultCount

  if (block.distanceDeltaM != null) {
    session.distanceDeltaSum += block.distanceDeltaM
    session.distanceDeltaCount += 1
  }
  if (block.gpsDistanceM != null) {
    session.gpsDistanceSum += block.gpsDistanceM
    session.gpsDistanceCount += 1
  }

  const blockMax = Math.max(block.maxAbsSpeedKmh, block.maxGpsSpeedKmh ?? 0)
  session.maxSpeedKmh = Math.max(session.maxSpeedKmh, blockMax)
  session.avgSpeedFallbackSum += block.avgAbsSpeedKmh
  session.avgSpeedFallbackCount += 1
  if (block.sampleCount > 0) {
    session.weightedSpeedSum += block.avgAbsSpeedKmh * block.sampleCount
    session.weightedSpeedCount += block.sampleCount
  }
}

function finalizeSession(session: MutableSessionAggregate): HistorySession {
  const distanceM =
    session.distanceDeltaCount > 0
      ? session.distanceDeltaSum
      : session.gpsDistanceCount > 0
        ? session.gpsDistanceSum
        : null
  const avgSpeedKmh =
    session.weightedSpeedCount > 0
      ? session.weightedSpeedSum / session.weightedSpeedCount
      : session.avgSpeedFallbackCount > 0
        ? session.avgSpeedFallbackSum / session.avgSpeedFallbackCount
        : 0

  return {
    id: `${session.deviceId ?? 'unknown'}:${session.startAtMs}:${session.endAtMs}`,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    startAtMs: session.startAtMs,
    endAtMs: session.endAtMs,
    blockIds: session.blockIds,
    blockCount: session.blockCount,
    sampleCount: session.sampleCount,
    gpsPointCount: session.gpsPointCount,
    preciseGpsPointCount: session.preciseGpsPointCount,
    distanceM,
    maxSpeedKmh: session.maxSpeedKmh,
    avgSpeedKmh,
    faultCount: session.faultCount,
    boundaryBefore: session.boundaryBefore,
  }
}

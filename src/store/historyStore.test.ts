import { beforeEach, expect, mock, test } from 'bun:test'

import type { TelemetryHistoryBlock, TelemetrySummary } from 'vesc-ble'

const summary: TelemetrySummary = {
  sampleCount: 0,
  gpsPointCount: 0,
  firstAtMs: null,
  lastAtMs: null,
  droppedPendingSamples: 0,
}

const getTelemetryHistory = mock(async () => [] as TelemetryHistoryBlock[])
const getHistoryRange = mock(async () => ({ boardSamples: [], gpsSamples: [], markers: [] }))
const getTelemetrySummary = mock(async () => summary)
const clearTelemetryHistory = mock(async () => {})
const deleteTelemetryRange = mock(async () => 0)
const getSettings = mock(async () => ({
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: true,
  selectedBoardId: null,
}))
const updateSetting = mock(async () => {})

const vescBleMock = {
  getTelemetryHistory,
  getHistoryRange,
  getTelemetrySummary,
  clearTelemetryHistory,
  deleteTelemetryRange,
  getSettings,
  updateSetting,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index.ts', () => vescBleMock)

function block(overrides: Partial<TelemetryHistoryBlock>): TelemetryHistoryBlock {
  const startAtMs = overrides.startAtMs ?? 0
  const endAtMs = overrides.endAtMs ?? startAtMs + 60_000
  return {
    id: overrides.id ?? `b-${startAtMs}`,
    startAtMs,
    endAtMs,
    bucketStartMs: overrides.bucketStartMs ?? startAtMs,
    deviceId: overrides.deviceId ?? 'dev-a',
    deviceName: overrides.deviceName ?? 'Board A',
    sampleCount: overrides.sampleCount ?? 10,
    gpsPointCount: overrides.gpsPointCount ?? 5,
    preciseGpsPointCount: overrides.preciseGpsPointCount ?? 4,
    maxAbsSpeedKmh: overrides.maxAbsSpeedKmh ?? 20,
    maxGpsSpeedKmh: overrides.maxGpsSpeedKmh ?? 18,
    avgAbsSpeedKmh: overrides.avgAbsSpeedKmh ?? 15,
    minBatteryVoltage: overrides.minBatteryVoltage ?? 52,
    maxMotorCurrent: overrides.maxMotorCurrent ?? 10,
    maxBatteryCurrent: overrides.maxBatteryCurrent ?? 8,
    maxDuty: overrides.maxDuty ?? 0.5,
    faultCount: overrides.faultCount ?? 0,
    distanceDeltaM: overrides.distanceDeltaM !== undefined ? overrides.distanceDeltaM : 100,
    gpsDistanceM: overrides.gpsDistanceM !== undefined ? overrides.gpsDistanceM : 120,
    boundaryBefore: overrides.boundaryBefore ?? 'none',
    boundaryMessage: overrides.boundaryMessage ?? null,
    gapBeforeMs: overrides.gapBeforeMs ?? null,
  }
}

beforeEach(async () => {
  getTelemetryHistory.mockClear()
  getHistoryRange.mockClear()
  getTelemetrySummary.mockClear()
  clearTelemetryHistory.mockClear()
  deleteTelemetryRange.mockClear()
  getSettings.mockClear()
  updateSetting.mockClear()
  const { useHistoryStore } = await import('./historyStore')
  useHistoryStore.setState({
    blocks: [],
    sessions: [],
    liveBlocks: [],
    selectedBlock: null,
    selectedSession: null,
    samples: [],
    gpsSamples: [],
    sessionSamples: [],
    sessionGpsSamples: [],
    sessionMarkers: [],
    liveSamples: [],
    liveGpsSamples: [],
    markers: [],
    summary: null,
    loading: false,
    loadingSamples: false,
    loadingSession: false,
    sessionTruncated: false,
    error: undefined,
    hasMore: true,
  })
})

test('removes selected session from history and selects next ride', async () => {
  const newest = block({ id: 'newest', startAtMs: 3_000_000, endAtMs: 3_060_000 })
  const selected = block({ id: 'selected', startAtMs: 2_000_000, endAtMs: 2_060_000 })
  const oldest = block({ id: 'oldest', startAtMs: 1_000_000, endAtMs: 1_060_000 })
  getTelemetryHistory.mockResolvedValueOnce([newest, selected, oldest])

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  await useHistoryStore.getState().selectSession(useHistoryStore.getState().sessions[1])
  await (useHistoryStore.getState() as any).removeSelectedSession()

  expect(deleteTelemetryRange).toHaveBeenCalledWith({
    fromMs: selected.startAtMs,
    toMs: selected.endAtMs,
    deviceId: selected.deviceId,
  })
  expect(useHistoryStore.getState().blocks.map((b) => b.id)).toEqual(['newest', 'oldest'])
  expect(useHistoryStore.getState().sessions.map((s) => s.id)).toHaveLength(2)
  expect(useHistoryStore.getState().selectedSession?.blockIds).toEqual(['oldest'])
  expect(useHistoryStore.getState().sessionSamples).toEqual([])
  expect(useHistoryStore.getState().sessionGpsSamples).toEqual([])
  expect(useHistoryStore.getState().sessionMarkers).toEqual([])
})

import { beforeEach, expect, mock, test } from 'bun:test'

import type {
  HistoryGpsSample,
  HistoryMarker,
  TelemetryHistoryBlock,
  TelemetrySample,
  TelemetrySummary,
} from 'vesc-ble'

// @ts-ignore
const actualVescBle = await import('../../modules/vesc-ble/src/index.ts')

const summary: TelemetrySummary = {
  sampleCount: 0,
  gpsPointCount: 0,
  firstAtMs: null,
  lastAtMs: null,
  droppedPendingSamples: 0,
}

const getTelemetryHistory = mock(async () => [] as TelemetryHistoryBlock[])
type HistoryRangeResult = {
  boardSamples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
}

const getHistoryRange = mock(
  async (): Promise<HistoryRangeResult> => ({
    boardSamples: [],
    gpsSamples: [],
    markers: [],
  }),
)
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
  ...actualVescBle,
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

function sample(overrides: Partial<TelemetrySample>): TelemetrySample {
  return {
    id: overrides.id ?? 1,
    capturedAtMs: overrides.capturedAtMs ?? 0,
    deviceId: overrides.deviceId ?? 'dev-a',
    deviceName: overrides.deviceName ?? 'Board A',
    speedKmh: overrides.speedKmh ?? 0,
    batteryVoltage: overrides.batteryVoltage ?? 50,
    motorCurrent: overrides.motorCurrent ?? 0,
    batteryCurrent: overrides.batteryCurrent ?? 0,
    dutyCycle: overrides.dutyCycle ?? 0,
    pitch: overrides.pitch ?? 0,
    roll: overrides.roll ?? 0,
    balancePitch: overrides.balancePitch ?? 0,
    balanceCurrent: overrides.balanceCurrent ?? 0,
    erpm: overrides.erpm ?? 0,
    state: overrides.state ?? 0,
    switchState: overrides.switchState ?? 0,
    adc1: overrides.adc1 ?? 0,
    adc2: overrides.adc2 ?? 0,
    odometer: overrides.odometer ?? null,
    tempMosfet: overrides.tempMosfet ?? null,
    tempMotor: overrides.tempMotor ?? null,
    hasFault: overrides.hasFault ?? false,
    faultCode: overrides.faultCode ?? 0,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
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
  const newest = block({
    id: 'newest',
    startAtMs: 3_000_000,
    endAtMs: 3_060_000,
  })
  const selected = block({
    id: 'selected',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const oldest = block({
    id: 'oldest',
    startAtMs: 1_000_000,
    endAtMs: 1_060_000,
  })
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

test('keeps current ride data visible while selecting another ride', async () => {
  const current = block({
    id: 'current',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const next = block({ id: 'next', startAtMs: 1_000_000, endAtMs: 1_060_000 })
  const currentSample = sample({ id: 10, capturedAtMs: current.startAtMs })
  const nextSample = sample({ id: 20, capturedAtMs: next.startAtMs })
  getTelemetryHistory.mockResolvedValueOnce([current, next])
  getHistoryRange.mockResolvedValueOnce({
    boardSamples: [currentSample],
    gpsSamples: [],
    markers: [],
  })

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  await useHistoryStore.getState().selectSession(useHistoryStore.getState().sessions[0])

  let resolveNextRange: (value: HistoryRangeResult) => void = () => {}
  getHistoryRange.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveNextRange = resolve
      }),
  )

  const selectNext = useHistoryStore
    .getState()
    .selectSession(useHistoryStore.getState().sessions[1])

  expect(useHistoryStore.getState().loadingSession).toBe(true)
  expect(useHistoryStore.getState().selectedSession?.id).toBe(
    useHistoryStore.getState().sessions[0].id,
  )
  expect(useHistoryStore.getState().sessionSamples).toEqual([currentSample])

  resolveNextRange({ boardSamples: [nextSample], gpsSamples: [], markers: [] })
  await selectNext

  expect(useHistoryStore.getState().loadingSession).toBe(false)
  expect(useHistoryStore.getState().selectedSession?.id).toBe(
    useHistoryStore.getState().sessions[1].id,
  )
  expect(useHistoryStore.getState().sessionSamples).toEqual([nextSample])
})

test('loads older history pages and merges sessions', async () => {
  const newest = block({
    id: 'newest',
    startAtMs: 3_000_000,
    endAtMs: 3_060_000,
  })
  const oldestLoaded = block({
    id: 'oldest-loaded',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const older = block({
    id: 'older',
    startAtMs: 1_000_000,
    endAtMs: 1_060_000,
  })
  getTelemetryHistory.mockResolvedValueOnce([newest, oldestLoaded])
  getTelemetryHistory.mockResolvedValueOnce([older])

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  useHistoryStore.setState({ hasMore: true })
  await useHistoryStore.getState().loadMore()

  expect((getTelemetryHistory.mock.calls as any[])[1][0]).toEqual({
    limit: 100,
    cursorBeforeMs: oldestLoaded.bucketStartMs - 1,
  })
  expect(useHistoryStore.getState().blocks.map((b) => b.id)).toEqual([
    'newest',
    'oldest-loaded',
    'older',
  ])
  expect(useHistoryStore.getState().sessions.map((s) => s.blockIds)).toEqual([
    ['newest'],
    ['oldest-loaded'],
    ['older'],
  ])
  expect(useHistoryStore.getState().hasMore).toBe(false)
})

test('keeps selected session addressable when older page expands it', async () => {
  const newest = block({
    id: 'newest',
    startAtMs: 3_000_000,
    endAtMs: 3_060_000,
  })
  const partial = block({
    id: 'partial',
    startAtMs: 2_000_000,
    endAtMs: 2_060_000,
  })
  const olderSameRide = block({
    id: 'older-same-ride',
    startAtMs: 1_960_000,
    endAtMs: 1_999_000,
  })
  getTelemetryHistory.mockResolvedValueOnce([newest, partial])
  getTelemetryHistory.mockResolvedValueOnce([olderSameRide])

  const { useHistoryStore } = await import('./historyStore')

  await useHistoryStore.getState().loadInitial()
  useHistoryStore.setState({
    hasMore: true,
    selectedSession: useHistoryStore.getState().sessions[1],
  })
  await useHistoryStore.getState().loadMore()

  expect(useHistoryStore.getState().sessions).toHaveLength(2)
  expect(useHistoryStore.getState().selectedSession?.startAtMs).toBe(1_960_000)
  expect(useHistoryStore.getState().selectedSession?.endAtMs).toBe(2_060_000)
})

import { beforeEach, expect, mock, test } from 'bun:test'
import type { Board } from 'vesc-ble'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

let persistedBoards: Board[] = []

const getBoards = mock(async () => persistedBoards)
const getSettings = mock(async () => ({
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: false,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
  movingSpeedThresholdKmh: 3,
  freeSpinMaxSpeedDeltaKmh: 10,
  freeSpinStationaryBoardCapKmh: 15,
  mapStyleKey: 'onedark',
  mapNavigationMode: 'northUp',
  historyMetricGradientsEnabled: true,
  historyMetricHotRanges: {},
}))
const setSelectedBoard = mock(() => {})
const upsertBoard = mock(async (board: Board) => {
  persistedBoards = [...persistedBoards.filter((b) => b.id !== board.id), board]
})
const deleteBoard = mock(async (id: string) => {
  persistedBoards = persistedBoards.filter((b) => b.id !== id)
})

const vescBleMock = {
  ...actualVescBle,
  getBoards,
  getSettings,
  setSelectedBoard,
  upsertBoard,
  deleteBoard,
}

mock.module('vesc-ble', () => vescBleMock)
mock.module('../../modules/vesc-ble/src/index', () => vescBleMock)

beforeEach(async () => {
  persistedBoards = []
  getBoards.mockClear()
  getSettings.mockClear()
  setSelectedBoard.mockClear()
  upsertBoard.mockClear()
  deleteBoard.mockClear()
  const { useBoardStore } = await import('./boardStore')
  useBoardStore.setState({
    boards: [],
    activeBoardId: null,
    hasLoaded: false,
  })
})

test('new boards default to Molicel P50B 20S2P preset battery config', async () => {
  const { DEFAULT_BATTERY_CONFIG, useBoardStore } = await import('./boardStore')

  const board = useBoardStore.getState().addBoard({ name: 'ADV' })

  expect(board.batteryConfig).toEqual(DEFAULT_BATTERY_CONFIG)
  expect(upsertBoard).toHaveBeenCalledWith(
    expect.objectContaining({ batteryConfig: DEFAULT_BATTERY_CONFIG }),
  )
})

test('new boards can use manual battery config', async () => {
  const { useBoardStore } = await import('./boardStore')
  const batteryConfig = { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }

  const board = useBoardStore.getState().addBoard({ name: 'ADV', batteryConfig })

  expect(board.batteryConfig).toEqual(batteryConfig)
  expect(upsertBoard).toHaveBeenCalledWith(expect.objectContaining({ batteryConfig }))
})

test('updated battery config survives a store reload from native boards', async () => {
  const { useBoardStore } = await import('./boardStore')
  const board: Board = {
    id: 'board-1',
    name: 'ADV',
    description: null,
    bleId: null,
    isStarred: true,
    createdAt: 1,
    batteryConfig: {
      mode: 'preset',
      cellPresetId: 'molicel:21700:p50b',
      seriesCount: 20,
      parallelCount: 2,
    },
    pollIntervalMs: 100,
  }
  const batteryConfig = { mode: 'manual' as const, minVoltage: 58, maxVoltage: 82 }

  useBoardStore.setState({ boards: [board], activeBoardId: board.id, hasLoaded: true })
  await useBoardStore.getState().updateBoard({ ...board, batteryConfig })
  useBoardStore.setState({ boards: [], activeBoardId: null, hasLoaded: false })
  await useBoardStore.getState().load()

  expect(useBoardStore.getState().boards[0]?.batteryConfig).toEqual(batteryConfig)
  expect(upsertBoard).toHaveBeenCalledWith(expect.objectContaining({ batteryConfig }))
})

import { create } from 'zustand'
import {
  deleteBoard as nativeDeleteBoard,
  getBoards,
  getSettings,
  setSelectedBoard as nativeSetSelectedBoard,
  type BatteryConfig,
  type Board,
  upsertBoard,
} from 'vesc-ble'

import { DEFAULT_BATTERY_CONFIG } from '@/lib/battery'

export type { Board } from 'vesc-ble'
export { DEFAULT_BATTERY_CONFIG } from '@/lib/battery'

import { generateId } from '@/helpers/id'

interface BoardState {
  boards: Board[]
  activeBoardId: string | null
  hasLoaded: boolean
}

interface BoardActions {
  load: () => Promise<void>
  addBoard: (data: {
    name: string
    description?: string
    bleId?: string
    batteryConfig?: BatteryConfig | null
  }) => Board
  updateBoard: (board: Board) => Promise<void>
  removeBoard: (id: string) => Promise<void>
  setActiveBoard: (id: string | null) => void
  starBoard: (id: string) => Promise<void>
}

export const useBoardStore = create<BoardState & BoardActions>((set, get) => ({
  boards: [],
  activeBoardId: null,
  hasLoaded: false,

  async load() {
    const boards = await getBoards()
    const settings = await getSettings()
    const { activeBoardId, hasLoaded } = get()
    const activeBoardExists = boards.some((b) => b.id === activeBoardId)
    const selectedBoardExists = boards.some((b) => b.id === settings.selectedBoardId)
    const nextActiveBoardId =
      hasLoaded && activeBoardExists
        ? activeBoardId
        : selectedBoardExists
          ? settings.selectedBoardId
          : (boards.find((b) => b.isStarred)?.id ?? boards[0]?.id ?? null)
    set({
      boards,
      hasLoaded: true,
      activeBoardId: nextActiveBoardId,
    })
    if (nextActiveBoardId !== settings.selectedBoardId) {
      nativeSetSelectedBoard(nextActiveBoardId)
    }
  },

  addBoard({ name, description, bleId, batteryConfig }) {
    const isFirst = get().boards.length === 0
    const board: Board = {
      id: generateId(),
      name,
      description: description ?? null,
      bleId: bleId ?? null,
      isStarred: isFirst,
      createdAt: Date.now(),
      batteryConfig: batteryConfig ?? DEFAULT_BATTERY_CONFIG,
      pollIntervalMs: 100,
    }
    set((state) => ({
      boards: [...state.boards, board],
      activeBoardId: state.activeBoardId ?? board.id,
    }))
    void upsertBoard(board)
    return board
  },

  async updateBoard(board) {
    set((state) => ({
      boards: state.boards.map((b) => (b.id === board.id ? board : b)),
    }))
    await upsertBoard(board)
  },

  async removeBoard(id) {
    set((state) => {
      const remaining = state.boards.filter((b) => b.id !== id)
      return {
        boards: remaining,
        activeBoardId:
          state.activeBoardId === id ? (remaining[0]?.id ?? null) : state.activeBoardId,
      }
    })
    await nativeDeleteBoard(id)
  },

  setActiveBoard(id) {
    set({ activeBoardId: id })
    nativeSetSelectedBoard(id)
  },

  async starBoard(id) {
    const updated = get().boards.map((b) => ({ ...b, isStarred: b.id === id }))
    set({ boards: updated, activeBoardId: id })
    await Promise.all(updated.map((b) => upsertBoard(b)))
  },
}))

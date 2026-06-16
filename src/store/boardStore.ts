import { create } from 'zustand'
import {
  deleteBoard as nativeDeleteBoard,
  getBoards,
  getSettings,
  setSelectedBoard as nativeSetSelectedBoard,
  type BatteryConfig,
  type Board,
  type BoardLink,
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
    link?: BoardLink | null
    batteryConfig?: BatteryConfig | null
  }) => Board
  updateBoard: (board: Board) => Promise<void>
  removeBoard: (id: string) => Promise<void>
  setActiveBoard: (id: string | null) => void
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
          : (boards[0]?.id ?? null)
    set({
      boards,
      hasLoaded: true,
      activeBoardId: nextActiveBoardId,
    })
    if (nextActiveBoardId !== settings.selectedBoardId) {
      nativeSetSelectedBoard(nextActiveBoardId)
    }
  },

  addBoard({ name, description, link, batteryConfig }) {
    const board: Board = {
      id: generateId(),
      name,
      description: description ?? null,
      createdAt: Date.now(),
      batteryConfig: batteryConfig ?? DEFAULT_BATTERY_CONFIG,
      link: link ?? null,
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
}))

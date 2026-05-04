import {
  type Board,
  getBoards,
  insertBoard,
  updateBoard as dbUpdate,
  deleteBoard as dbDelete,
} from '../db/boards'
import { create } from 'zustand'

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

interface BoardState {
  boards: Board[]
  activeBoardId: string | null
  hasLoaded: boolean
}

interface BoardActions {
  load: () => void
  addBoard: (data: {
    name: string
    description?: string
    bleId?: string
    minVoltage?: number | null
    maxVoltage?: number | null
  }) => Board
  updateBoard: (board: Board) => void
  removeBoard: (id: string) => void
  setActiveBoard: (id: string | null) => void
  starBoard: (id: string) => void
}

export const useBoardStore = create<BoardState & BoardActions>((set, get) => ({
  boards: [],
  activeBoardId: null,
  hasLoaded: false,

  load() {
    const boards = getBoards()
    const { activeBoardId, hasLoaded } = get()
    const activeBoardExists = boards.some((b) => b.id === activeBoardId)
    set({
      boards,
      hasLoaded: true,
      activeBoardId:
        hasLoaded && activeBoardExists
          ? activeBoardId
          : (boards.find((b) => b.isStarred)?.id ?? boards[0]?.id ?? null),
    })
  },

  addBoard({ name, description, bleId, minVoltage, maxVoltage }) {
    const isFirst = get().boards.length === 0
    const board: Board = {
      id: generateId(),
      name,
      description: description ?? null,
      bleId: bleId ?? null,
      isStarred: isFirst,
      createdAt: Date.now(),
      minVoltage: minVoltage ?? null,
      maxVoltage: maxVoltage ?? null,
    }
    insertBoard(board)
    set((state) => ({
      boards: [...state.boards, board],
      activeBoardId: state.activeBoardId ?? board.id,
    }))
    return board
  },

  updateBoard(board) {
    dbUpdate(board)
    set((state) => ({
      boards: state.boards.map((b) => (b.id === board.id ? board : b)),
    }))
  },

  removeBoard(id) {
    dbDelete(id)
    set((state) => {
      const remaining = state.boards.filter((b) => b.id !== id)
      return {
        boards: remaining,
        activeBoardId:
          state.activeBoardId === id ? (remaining[0]?.id ?? null) : state.activeBoardId,
      }
    })
  },

  setActiveBoard(id) {
    set({ activeBoardId: id })
  },

  starBoard(id) {
    const updated = get().boards.map((b) => ({ ...b, isStarred: b.id === id }))
    updated.forEach((b) => dbUpdate(b))
    set({ boards: updated, activeBoardId: id })
  },
}))

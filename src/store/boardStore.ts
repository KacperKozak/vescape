import { create } from 'zustand'
import { deleteBoard as nativeDeleteBoard, getBoards, type Board, upsertBoard } from 'vesc-ble'

export type { Board } from 'vesc-ble'

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
  load: () => Promise<void>
  addBoard: (data: {
    name: string
    description?: string
    bleId?: string
    minVoltage?: number | null
    maxVoltage?: number | null
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
  },

  async starBoard(id) {
    const updated = get().boards.map((b) => ({ ...b, isStarred: b.id === id }))
    set({ boards: updated, activeBoardId: id })
    await Promise.all(updated.map((b) => upsertBoard(b)))
  },
}))

import { create } from 'zustand'
import { addBoardWarningsListener, type BoardWarning } from 'vesc-ble'

/**
 * Dumb JS mirror of the durable native Board Warning registry. Native owns detection and truth; this
 * store only renders. Each `onBoardWarnings` emit carries the full warning list for one Board, and we
 * replace that board's slice wholesale (never merge) so JS state exactly tracks native state — the
 * event fires on every registry change and on subscribe, so a late subscriber is immediately
 * consistent.
 */
interface BoardWarningsState {
  /** Warnings keyed by boardId. A board with no warnings has no entry. */
  warningsByBoard: Record<string, BoardWarning[]>
  replaceBoard: (boardId: string, warnings: BoardWarning[]) => void
  clear: () => void
}

export const useBoardWarningsStore = create<BoardWarningsState>((set) => ({
  warningsByBoard: {},
  replaceBoard: (boardId, warnings) =>
    set((state) => {
      const next = { ...state.warningsByBoard }
      if (warnings.length === 0) {
        delete next[boardId]
      } else {
        next[boardId] = warnings
      }
      return { warningsByBoard: next }
    }),
  clear: () => set({ warningsByBoard: {} }),
}))

/**
 * Wire the native → JS Board Warning mirror. Call once at app root; returns an unsubscribe. The
 * native side replays the current warnings for every board on subscribe, so no manual initial load
 * is needed.
 */
export function startBoardWarningsSync(): () => void {
  const sub = addBoardWarningsListener((event) => {
    useBoardWarningsStore.getState().replaceBoard(event.boardId, event.warnings)
  })
  return () => sub.remove()
}

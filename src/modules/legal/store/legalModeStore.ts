import { create } from 'zustand'
import { setLegalMode } from 'vescape-core'

interface LegalModeActions {
  setEnabled(boardId: string, enabled: boolean): Promise<void>
}

export const useLegalModeStore = create<LegalModeActions>(() => ({
  async setEnabled(boardId, enabled) {
    await setLegalMode(boardId, enabled)
  },
}))

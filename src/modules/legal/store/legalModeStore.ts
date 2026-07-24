import { create } from 'zustand'

import { type LegalModeSettings } from '@/modules/legal/lib/legalMode'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

interface LegalModeActions {
  setEnabled(enabled: boolean): Promise<void>
}

export const useLegalModeStore = create<LegalModeActions>(() => ({
  async setEnabled(enabled) {
    await saveLegalMode({ enabled })
  },
}))

async function saveLegalMode(settings: LegalModeSettings) {
  await useSettingsStore.getState().setLegalMode(settings)
}

import { create } from 'zustand'
import { deleteAlertRule, upsertAlertRule } from 'vesc-ble'

import {
  DEFAULT_LEGAL_MODE_SETTINGS,
  LEGAL_MODE_ALERT_RULE_ID,
  applyJurisdictionDefaults,
  buildLegalModeWarningAlertRule,
  legalJurisdictionResultFromCountryCode,
  normalizeLegalModeSettings,
  setLegalSpeed,
  setWarningSpeed,
  type LegalModeSettings,
} from '@/lib/legalMode'
import { useSettingsStore } from '@/store/settingsStore'

interface LegalModeState {
  syncing: boolean
}

interface LegalModeActions {
  setEnabled(enabled: boolean): Promise<void>
  applyJurisdiction(countryCode: string): Promise<void>
  setSpeeds(legalSpeedKmh: number, warningSpeedKmh: number): Promise<void>
  syncWarningAlert(): Promise<void>
}

export const useLegalModeStore = create<LegalModeState & LegalModeActions>((set, get) => ({
  syncing: false,

  async setEnabled(enabled) {
    await saveLegalMode({ ...getLegalModeSettings(), enabled })
    await get().syncWarningAlert()
  },

  async applyJurisdiction(countryCode) {
    const jurisdiction = legalJurisdictionResultFromCountryCode(countryCode)
    if (!jurisdiction) return
    await saveLegalMode(applyJurisdictionDefaults(getLegalModeSettings(), jurisdiction))
    await get().syncWarningAlert()
  },

  async setSpeeds(legalSpeedKmh, warningSpeedKmh) {
    const withLegalSpeed = setLegalSpeed(getLegalModeSettings(), legalSpeedKmh)
    await saveLegalMode(setWarningSpeed(withLegalSpeed, warningSpeedKmh))
    await get().syncWarningAlert()
  },

  async syncWarningAlert() {
    set({ syncing: true })
    try {
      const rule = buildLegalModeWarningAlertRule(getLegalModeSettings(), Date.now())
      if (rule) {
        await upsertAlertRule(rule)
      } else {
        await deleteAlertRule(LEGAL_MODE_ALERT_RULE_ID)
      }
    } finally {
      set({ syncing: false })
    }
  },
}))

export function getLegalModeSettings(): LegalModeSettings {
  return normalizeLegalModeSettings(
    useSettingsStore.getState().legalMode ?? DEFAULT_LEGAL_MODE_SETTINGS,
  )
}

async function saveLegalMode(settings: LegalModeSettings) {
  await useSettingsStore.getState().setLegalMode(settings)
}

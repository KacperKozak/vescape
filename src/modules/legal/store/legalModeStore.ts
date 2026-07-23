import { create } from 'zustand'

import {
  DEFAULT_LEGAL_MODE_SETTINGS,
  applyJurisdictionDefaults,
  legalJurisdictionResultFromCountryCode,
  normalizeLegalModeSettings,
  setLegalSpeed as deriveLegalSpeed,
  setWarningSpeed as deriveWarningSpeed,
  type LegalModeSettings,
} from '@/modules/legal/lib/legalMode'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

interface LegalModeActions {
  setEnabled(enabled: boolean): Promise<void>
  applyJurisdiction(countryCode: string): Promise<void>
  setLegalSpeed(speedKmh: number): Promise<void>
  setWarningSpeed(speedKmh: number): Promise<void>
  setSpeeds(legalSpeedKmh: number, warningSpeedKmh: number): Promise<void>
}

export const useLegalModeStore = create<LegalModeActions>(() => ({
  async setEnabled(enabled) {
    const settings = getLegalModeSettings()
    await saveLegalMode(
      enabled ? resetSpeedsForCurrentJurisdiction(settings) : { ...settings, enabled },
    )
  },

  async applyJurisdiction(countryCode) {
    const jurisdiction = legalJurisdictionResultFromCountryCode(countryCode)
    if (!jurisdiction) return
    await saveLegalMode(applyJurisdictionDefaults(getLegalModeSettings(), jurisdiction))
  },

  async setLegalSpeed(speedKmh) {
    await saveLegalMode(deriveLegalSpeed(getLegalModeSettings(), speedKmh))
  },

  async setWarningSpeed(speedKmh) {
    await saveLegalMode(deriveWarningSpeed(getLegalModeSettings(), speedKmh))
  },

  async setSpeeds(legalSpeedKmh, warningSpeedKmh) {
    const withLegalSpeed = deriveLegalSpeed(getLegalModeSettings(), legalSpeedKmh)
    await saveLegalMode(deriveWarningSpeed(withLegalSpeed, warningSpeedKmh))
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

function resetSpeedsForCurrentJurisdiction(settings: LegalModeSettings): LegalModeSettings {
  const jurisdiction = settings.jurisdiction
  return {
    ...settings,
    enabled: true,
    legalSpeedKmh: jurisdiction?.legalSpeedKmh ?? DEFAULT_LEGAL_MODE_SETTINGS.legalSpeedKmh,
    warningSpeedKmh: jurisdiction?.warningSpeedKmh ?? DEFAULT_LEGAL_MODE_SETTINGS.warningSpeedKmh,
    warningManuallyEdited: false,
  }
}

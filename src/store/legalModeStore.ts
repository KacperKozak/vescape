import { create } from 'zustand'
import { deleteAlertRule } from 'vesc-ble'

import {
  DEFAULT_LEGAL_MODE_SETTINGS,
  LEGAL_MODE_ALERT_RULE_ID,
  applyJurisdictionDefaults,
  buildLegalModeWarningAlertRule,
  legalJurisdictionResultFromCountryCode,
  normalizeLegalModeSettings,
  setLegalSpeed as deriveLegalSpeed,
  setWarningSpeed as deriveWarningSpeed,
  type LegalModeSettings,
} from '@/lib/legalMode'
import { useAlertsStore } from '@/store/alertsStore'
import { useSettingsStore } from '@/store/settingsStore'

interface LegalModeState {
  syncing: boolean
}

interface LegalModeActions {
  setEnabled(enabled: boolean): Promise<void>
  applyJurisdiction(countryCode: string): Promise<void>
  setLegalSpeed(speedKmh: number): Promise<void>
  setWarningSpeed(speedKmh: number): Promise<void>
  setSpeeds(legalSpeedKmh: number, warningSpeedKmh: number): Promise<void>
  syncWarningAlert(): Promise<void>
}

export const useLegalModeStore = create<LegalModeState & LegalModeActions>((set, get) => ({
  syncing: false,

  async setEnabled(enabled) {
    const settings = getLegalModeSettings()
    await saveLegalMode(
      enabled ? resetSpeedsForCurrentJurisdiction(settings) : { ...settings, enabled },
    )
    await get().syncWarningAlert()
  },

  async applyJurisdiction(countryCode) {
    const jurisdiction = legalJurisdictionResultFromCountryCode(countryCode)
    if (!jurisdiction) return
    await saveLegalMode(applyJurisdictionDefaults(getLegalModeSettings(), jurisdiction))
    await get().syncWarningAlert()
  },

  async setLegalSpeed(speedKmh) {
    await saveLegalMode(deriveLegalSpeed(getLegalModeSettings(), speedKmh))
    await get().syncWarningAlert()
  },

  async setWarningSpeed(speedKmh) {
    await saveLegalMode(deriveWarningSpeed(getLegalModeSettings(), speedKmh))
    await get().syncWarningAlert()
  },

  async setSpeeds(legalSpeedKmh, warningSpeedKmh) {
    const withLegalSpeed = deriveLegalSpeed(getLegalModeSettings(), legalSpeedKmh)
    await saveLegalMode(deriveWarningSpeed(withLegalSpeed, warningSpeedKmh))
    await get().syncWarningAlert()
  },

  async syncWarningAlert() {
    set({ syncing: true })
    try {
      const currentRule = useAlertsStore
        .getState()
        .rules.find((candidate) => candidate.id === LEGAL_MODE_ALERT_RULE_ID)
      const rule = buildLegalModeWarningAlertRule(
        getLegalModeSettings(),
        currentRule?.createdAt ?? Date.now(),
      )
      if (rule) {
        await useAlertsStore.getState().upsert(rule)
      } else {
        useAlertsStore.setState((state) => ({
          rules: state.rules.filter((candidate) => candidate.id !== LEGAL_MODE_ALERT_RULE_ID),
        }))
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

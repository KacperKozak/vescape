import type { AlertRule, LocationEvent } from 'vescape-core'
import { getLegalLimitCountryByCode, type LegalLimitCountry } from '@/modules/legal/lib/legalLimits'
import type { LegalRoadStatus } from '@/modules/legal/lib/types'

export const LEGAL_MODE_ALERT_RULE_ID = 'legal-mode-speed-alert'
export const LEGAL_MODE_ALERT_SOUND_TYPE = 'preset:tick'
export const LEGAL_MODE_ALERT_SOURCE = 'legal-mode'

export interface LegalJurisdictionResult {
  countryCode: string
  countryName: string
  legalSpeedKmh: number
  warningSpeedKmh: number
  legalRoadStatus: LegalRoadStatus
  warningText: string | null
  sourceUrl: string
  checkedAt: string
}

export interface LegalModeSettings {
  enabled: boolean
  legalSpeedKmh: number
  warningSpeedKmh: number
  warningManuallyEdited: boolean
  jurisdiction: LegalJurisdictionResult | null
}

export const POLAND_LEGAL_MODE_DEFAULTS = legalJurisdictionResultFromCountryCode('PL')!

export const DEFAULT_LEGAL_MODE_SETTINGS: LegalModeSettings = {
  enabled: false,
  legalSpeedKmh: POLAND_LEGAL_MODE_DEFAULTS.legalSpeedKmh,
  warningSpeedKmh: POLAND_LEGAL_MODE_DEFAULTS.warningSpeedKmh,
  warningManuallyEdited: false,
  jurisdiction: null,
}

export function normalizeLegalModeSettings(raw: unknown): LegalModeSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_LEGAL_MODE_SETTINGS
  const value = raw as Partial<LegalModeSettings>
  const legalSpeedKmh = positiveSpeed(value.legalSpeedKmh, POLAND_LEGAL_MODE_DEFAULTS.legalSpeedKmh)
  const warningSpeedKmh = clampWarningSpeed(
    positiveSpeed(value.warningSpeedKmh, legalSpeedKmh - 5),
    legalSpeedKmh,
  )
  return {
    enabled: value.enabled === true,
    legalSpeedKmh,
    warningSpeedKmh,
    warningManuallyEdited: value.warningManuallyEdited === true,
    jurisdiction: normalizeJurisdiction(value.jurisdiction),
  }
}

export function resolveJurisdictionFromLocation(
  location: LocationEvent | null,
): LegalJurisdictionResult | null {
  if (!location) return null
  if (insideBox(location, { minLat: 45.8, maxLat: 47.9, minLon: 5.9, maxLon: 10.6 })) {
    return legalJurisdictionResultFromCountryCode('CH')
  }
  if (insideBox(location, { minLat: 46.3, maxLat: 49.2, minLon: 9.4, maxLon: 17.2 })) {
    return legalJurisdictionResultFromCountryCode('AT')
  }
  if (insideBox(location, { minLat: 49.0, maxLat: 55.1, minLon: 14.0, maxLon: 24.2 })) {
    return legalJurisdictionResultFromCountryCode('PL')
  }
  if (insideBox(location, { minLat: 47.2, maxLat: 55.2, minLon: 5.8, maxLon: 15.1 })) {
    return legalJurisdictionResultFromCountryCode('DE')
  }
  return null
}

export function legalJurisdictionResultFromCountryCode(
  countryCode: string,
): LegalJurisdictionResult | null {
  const country = getLegalLimitCountryByCode(countryCode)
  if (!country || !hasApplicableLegalLimits(country)) return null
  return legalJurisdictionResultFromCountry(country)
}

export function applyJurisdictionDefaults(
  settings: LegalModeSettings,
  jurisdiction: LegalJurisdictionResult,
): LegalModeSettings {
  return {
    ...settings,
    legalSpeedKmh: jurisdiction.legalSpeedKmh,
    warningSpeedKmh: settings.warningManuallyEdited
      ? clampWarningSpeed(settings.warningSpeedKmh, jurisdiction.legalSpeedKmh)
      : jurisdiction.warningSpeedKmh,
    jurisdiction,
  }
}

export function setLegalSpeed(settings: LegalModeSettings, speedKmh: number): LegalModeSettings {
  const legalSpeedKmh = positiveSpeed(speedKmh, settings.legalSpeedKmh)
  return {
    ...settings,
    legalSpeedKmh,
    warningSpeedKmh: settings.warningManuallyEdited
      ? clampWarningSpeed(settings.warningSpeedKmh, legalSpeedKmh)
      : clampWarningSpeed(legalSpeedKmh - 5, legalSpeedKmh),
  }
}

export function setWarningSpeed(settings: LegalModeSettings, speedKmh: number): LegalModeSettings {
  return {
    ...settings,
    warningSpeedKmh: clampWarningSpeed(speedKmh, settings.legalSpeedKmh),
    warningManuallyEdited: true,
  }
}

export function legalModeAlertRule(settings: LegalModeSettings, createdAt: number): AlertRule {
  return {
    id: LEGAL_MODE_ALERT_RULE_ID,
    controlId: 'speed',
    threshold: settings.warningSpeedKmh,
    thresholdMax: settings.legalSpeedKmh,
    enabled: settings.enabled,
    soundType: LEGAL_MODE_ALERT_SOUND_TYPE,
    createdAt,
    source: LEGAL_MODE_ALERT_SOURCE,
  }
}

export function buildLegalModeWarningAlertRule(
  settings: LegalModeSettings,
  createdAt: number,
): AlertRule | null {
  if (!settings.enabled) return null
  return legalModeAlertRule(settings, createdAt)
}

export function isLegalModeAlertRule(rule: Pick<AlertRule, 'id' | 'source'>) {
  return rule.source === LEGAL_MODE_ALERT_SOURCE || rule.id === LEGAL_MODE_ALERT_RULE_ID
}

function positiveSpeed(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.round(value))
}

function clampWarningSpeed(value: number, legalSpeedKmh: number): number {
  return Math.min(Math.max(1, Math.round(value)), Math.max(1, legalSpeedKmh - 1))
}

function normalizeJurisdiction(raw: unknown): LegalJurisdictionResult | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as LegalJurisdictionResult
  if (
    typeof value.countryCode !== 'string' ||
    typeof value.countryName !== 'string' ||
    typeof value.legalSpeedKmh !== 'number' ||
    typeof value.warningSpeedKmh !== 'number' ||
    !['likelyLegal', 'restricted', 'notRoadLegal', 'unknown'].includes(value.legalRoadStatus) ||
    typeof value.sourceUrl !== 'string' ||
    typeof value.checkedAt !== 'string'
  ) {
    return null
  }
  const legalSpeedKmh = positiveSpeed(value.legalSpeedKmh, POLAND_LEGAL_MODE_DEFAULTS.legalSpeedKmh)
  return {
    countryCode: value.countryCode,
    countryName: value.countryName,
    legalSpeedKmh,
    warningSpeedKmh: clampWarningSpeed(
      positiveSpeed(value.warningSpeedKmh, POLAND_LEGAL_MODE_DEFAULTS.warningSpeedKmh),
      legalSpeedKmh,
    ),
    legalRoadStatus: value.legalRoadStatus,
    warningText: typeof value.warningText === 'string' ? value.warningText : null,
    sourceUrl: value.sourceUrl,
    checkedAt: value.checkedAt,
  }
}

function hasApplicableLegalLimits(
  country: LegalLimitCountry,
): country is LegalLimitCountry & { legalSpeedKmh: number; warningSpeedKmh: number } {
  return country.legalSpeedKmh != null && country.warningSpeedKmh != null
}

function legalJurisdictionResultFromCountry(
  country: LegalLimitCountry & { legalSpeedKmh: number; warningSpeedKmh: number },
): LegalJurisdictionResult {
  return {
    countryCode: country.code,
    countryName: country.name,
    legalSpeedKmh: country.legalSpeedKmh,
    warningSpeedKmh: country.warningSpeedKmh,
    legalRoadStatus: country.status,
    warningText: country.warningText,
    sourceUrl: country.sourceUrl,
    checkedAt: country.checkedAt,
  }
}

function insideBox(
  location: LocationEvent,
  box: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): boolean {
  return (
    location.latitude >= box.minLat &&
    location.latitude <= box.maxLat &&
    location.longitude >= box.minLon &&
    location.longitude <= box.maxLon
  )
}

import type { AlertRule, LocationEvent } from 'vesc-ble'

export const LEGAL_MODE_ALERT_RULE_ID = 'legal-mode-speed-alert'
export const LEGAL_MODE_ALERT_SOUND_TYPE = 'preset:tick'

export type LegalRoadStatus = 'likelyLegal' | 'restricted' | 'notRoadLegal' | 'unknown'

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

export const POLAND_LEGAL_MODE_DEFAULTS: LegalJurisdictionResult = {
  countryCode: 'PL',
  countryName: 'Poland',
  legalSpeedKmh: 20,
  warningSpeedKmh: 15,
  legalRoadStatus: 'likelyLegal',
  warningText: null,
  sourceUrl:
    'https://www.gov.pl/web/infrastruktura/nowe-przepisy-dotyczace-hulajnog-elektrycznych-i-urzadzen-transportu-osobistego',
  checkedAt: '2026-07-17',
}

const GERMANY_LEGAL_MODE_DEFAULTS: LegalJurisdictionResult = {
  countryCode: 'DE',
  countryName: 'Germany',
  legalSpeedKmh: 25,
  warningSpeedKmh: 20,
  legalRoadStatus: 'notRoadLegal',
  warningText:
    'Germany: this board category appears not road-legal on public roads. eKFV applies to approved small electric vehicles with handlebars or holding bars, operating permits, insurance plates, and required equipment.',
  sourceUrl: 'https://www.gesetze-im-internet.de/ekfv/',
  checkedAt: '2026-07-17',
}

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
  if (insideBox(location, { minLat: 49.0, maxLat: 55.1, minLon: 14.0, maxLon: 24.2 })) {
    return POLAND_LEGAL_MODE_DEFAULTS
  }
  if (insideBox(location, { minLat: 47.2, maxLat: 55.2, minLon: 5.8, maxLon: 15.1 })) {
    return GERMANY_LEGAL_MODE_DEFAULTS
  }
  return null
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
  }
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
  return {
    countryCode: value.countryCode,
    countryName: value.countryName,
    legalSpeedKmh: positiveSpeed(value.legalSpeedKmh, POLAND_LEGAL_MODE_DEFAULTS.legalSpeedKmh),
    warningSpeedKmh: clampWarningSpeed(
      positiveSpeed(value.warningSpeedKmh, POLAND_LEGAL_MODE_DEFAULTS.warningSpeedKmh),
      value.legalSpeedKmh,
    ),
    legalRoadStatus: value.legalRoadStatus,
    warningText: typeof value.warningText === 'string' ? value.warningText : null,
    sourceUrl: value.sourceUrl,
    checkedAt: value.checkedAt,
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

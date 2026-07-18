import { describe, expect, test } from 'bun:test'
import type { LocationEvent } from 'vesc-ble'

import {
  DEFAULT_LEGAL_MODE_SETTINGS,
  LEGAL_MODE_ALERT_RULE_ID,
  LEGAL_MODE_ALERT_SOURCE,
  isLegalModeAlertRule,
  legalModeAlertRule,
  resolveJurisdictionFromLocation,
  setLegalSpeed,
  setWarningSpeed,
} from '@/lib/legalMode'

function location(latitude: number, longitude: number): LocationEvent {
  return {
    latitude,
    longitude,
    speedMps: null,
    bearingDeg: null,
    accuracyM: 5,
    altitudeM: null,
    timestamp: 1,
    precise: true,
  }
}

describe('Legal Mode derivation', () => {
  test('uses Poland defaults from GPS country lookup', () => {
    const result = resolveJurisdictionFromLocation(location(52.2297, 21.0122))

    expect(result).toMatchObject({
      countryCode: 'PL',
      legalSpeedKmh: 20,
      warningSpeedKmh: 15,
      legalRoadStatus: 'likelyLegal',
    })
  })

  test('keeps warning speed below legal speed when rider edits values', () => {
    const withWarning = setWarningSpeed(DEFAULT_LEGAL_MODE_SETTINGS, 19)
    const withLimit = setLegalSpeed(withWarning, 12)

    expect(withLimit.warningSpeedKmh).toBe(11)
    expect(withLimit.warningManuallyEdited).toBe(true)
  })

  test('derives warning speed from legal speed until manually edited', () => {
    const next = setLegalSpeed(DEFAULT_LEGAL_MODE_SETTINGS, 25)

    expect(next.legalSpeedKmh).toBe(25)
    expect(next.warningSpeedKmh).toBe(20)
  })

  test('skips not-road-legal countries when deriving Legal Mode jurisdiction', () => {
    const germany = resolveJurisdictionFromLocation(location(52.52, 13.405))

    expect(germany).toBeNull()
  })

  test('resolves Austria as walking-pace restricted but skips Switzerland as not road-legal', () => {
    const austria = resolveJurisdictionFromLocation(location(48.2082, 16.3738))
    const switzerland = resolveJurisdictionFromLocation(location(47.3769, 8.5417))

    expect(austria).toMatchObject({
      countryCode: 'AT',
      legalSpeedKmh: 5,
      warningSpeedKmh: 4,
      legalRoadStatus: 'restricted',
    })
    expect(switzerland).toBeNull()
  })

  test('builds stable generated alert ownership and range thresholds', () => {
    const rule = legalModeAlertRule({ ...DEFAULT_LEGAL_MODE_SETTINGS, enabled: true }, 123)

    expect(rule).toMatchObject({
      id: LEGAL_MODE_ALERT_RULE_ID,
      controlId: 'speed',
      threshold: 15,
      thresholdMax: 20,
      enabled: true,
      soundType: 'preset:tick',
      createdAt: 123,
      source: LEGAL_MODE_ALERT_SOURCE,
    })
  })

  test('recognizes generated alerts by source with legacy id fallback', () => {
    expect(isLegalModeAlertRule({ id: 'manual', source: LEGAL_MODE_ALERT_SOURCE })).toBe(true)
    expect(isLegalModeAlertRule({ id: LEGAL_MODE_ALERT_RULE_ID })).toBe(true)
    expect(isLegalModeAlertRule({ id: 'manual' })).toBe(false)
  })
})

import { describe, expect, test } from 'bun:test'

import {
  legalPolicyFromReference,
  normalizeLegalPolicyReference,
} from '@/modules/legal/lib/legalMode'
import { LEGAL_LIMIT_COUNTRIES } from '@/modules/legal/lib/legalLimits'

describe('Legal Policy derivation', () => {
  test('resolves the stored country reference through the canonical catalog', () => {
    expect(legalPolicyFromReference({ jurisdictionCode: 'pl' })).toMatchObject({
      code: 'PL',
      legalSpeedKmh: 20,
      warningSpeedKmh: 15,
      status: 'likelyLegal',
    })
  })

  test('unsupported and malformed references stay unresolved', () => {
    expect(legalPolicyFromReference({ jurisdictionCode: 'US' })).toBeNull()
    expect(normalizeLegalPolicyReference({ jurisdictionCode: '' })).toBeNull()
    expect(normalizeLegalPolicyReference(null)).toBeNull()
  })

  test('classifies Czech self-balancing transporters as restricted rather than prohibited', () => {
    expect(legalPolicyFromReference({ jurisdictionCode: 'CZ' })).toMatchObject({
      code: 'CZ',
      legalSpeedKmh: null,
      referenceSpeedKmh: null,
      status: 'restricted',
      confidence: 'high',
    })
  })

  test('catalog country codes are unique and warning speeds stay below legal limits', () => {
    const codes = LEGAL_LIMIT_COUNTRIES.map((country) => country.code)

    expect(new Set(codes).size).toBe(codes.length)
    for (const country of LEGAL_LIMIT_COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
      if (country.legalSpeedKmh != null && country.warningSpeedKmh != null) {
        expect(country.warningSpeedKmh).toBeLessThan(country.legalSpeedKmh)
      }
    }
  })
})

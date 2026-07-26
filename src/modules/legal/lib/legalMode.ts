import type { LegalPolicyReference } from 'vescape-core'

import { getLegalLimitCountryByCode, type LegalLimitCountry } from '@/modules/legal/lib/legalLimits'

export function normalizeLegalPolicyReference(raw: unknown): LegalPolicyReference | null {
  if (!raw || typeof raw !== 'object') return null
  const jurisdictionCode = (raw as Partial<LegalPolicyReference>).jurisdictionCode
  if (typeof jurisdictionCode !== 'string') return null
  const normalized = jurisdictionCode.trim().toUpperCase()
  return normalized.length === 2 ? { jurisdictionCode: normalized } : null
}

export function legalPolicyFromReference(raw: unknown): LegalLimitCountry | null {
  const reference = normalizeLegalPolicyReference(raw)
  return reference ? getLegalLimitCountryByCode(reference.jurisdictionCode) : null
}

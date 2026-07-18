import type { TuneProfileFieldValue } from 'vescape-core'

export function isDisplayableFieldValue(
  value: TuneProfileFieldValue | undefined,
): value is number | boolean | string {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
}

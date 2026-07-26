import { expect, test } from 'bun:test'

import { generateAlertPresetRules } from '@/modules/alerts/lib/alertPresets'
import { materializePresetRules } from '@/modules/alerts/lib/customAlertRules'

const OPTIONS = { boardTopSpeedKmh: 40, hasBatteryConfig: true }

test('materializing a level reproduces exactly what it generates', () => {
  const specs = generateAlertPresetRules('battery', 'safe', OPTIONS)
  const rules = materializePresetRules('battery', 'safe', OPTIONS)

  expect(
    rules.map(({ threshold, thresholdMax, soundType }) => ({
      threshold,
      thresholdMax,
      soundType,
    })),
  ).toEqual(
    specs.map(({ threshold, thresholdMax, soundType }) => ({
      threshold,
      thresholdMax,
      soundType,
    })),
  )
  expect(rules.every((rule) => rule.enabled)).toBe(true)
})

test('materialized rules carry fresh ids and no preset provenance', () => {
  const rules = materializePresetRules('speed', 'normal', OPTIONS)
  const other = materializePresetRules('speed', 'normal', OPTIONS)

  // Reusing the deterministic `preset:<metric>:<i>` ids would let regeneration clobber rider rules.
  expect(rules.every((rule) => !rule.id.startsWith('preset:'))).toBe(true)
  expect(rules.map((r) => r.id)).not.toEqual(other.map((r) => r.id))
  expect(rules.every((rule) => !('source' in rule))).toBe(true)
})

test('materializing off or custom yields an empty rider set', () => {
  expect(materializePresetRules('duty', 'off', OPTIONS)).toEqual([])
  expect(materializePresetRules('duty', 'custom', OPTIONS)).toEqual([])
})

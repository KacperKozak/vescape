import { describe, expect, test } from 'bun:test'

import {
  ALERT_PRESET_ACTIVE_LEVELS,
  ALERT_PRESET_GEIGER_SOUND_TYPE,
  ALERT_PRESET_LEVELS,
  generateAlertPresetRules,
  type AlertPresetMetric,
} from '@/modules/alerts/lib/alertPresets'

const ALL_METRICS: AlertPresetMetric[] = [
  'battery',
  'speed',
  'duty',
  'motor-temp',
  'controller-temp',
]

describe('ALERT_PRESET_LEVELS config', () => {
  test('declares safe/normal/pro for every metric', () => {
    for (const metric of ALL_METRICS) {
      const config = ALERT_PRESET_LEVELS[metric]
      for (const level of ALERT_PRESET_ACTIVE_LEVELS) {
        expect(config.levels[level]).toBeDefined()
      }
    }
  })
})

describe('generateAlertPresetRules — off', () => {
  test('off yields no rules for any metric', () => {
    for (const metric of ALL_METRICS) {
      expect(
        generateAlertPresetRules(metric, 'off', {
          riderTopSpeedKmh: 50,
          hasBatteryConfig: true,
        }),
      ).toEqual([])
    }
  })
})

describe('generateAlertPresetRules — battery / temperature (discrete)', () => {
  test('battery emits single-threshold TTS rules in percent', () => {
    const rules = generateAlertPresetRules('battery', 'normal', { hasBatteryConfig: true })
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.controlId).toBe('battery')
      expect(rule.thresholdMax).toBeNull()
      expect(rule.soundType).toContain('tts:')
      expect(rule.threshold).toBeGreaterThan(0)
      expect(rule.threshold).toBeLessThanOrEqual(100)
    }
  })

  test('discrete points grow in count and start earlier with protection', () => {
    // Battery direction is "below": earlier protection == a higher percentage.
    const safe = generateAlertPresetRules('battery', 'safe', { hasBatteryConfig: true })
    const normal = generateAlertPresetRules('battery', 'normal', { hasBatteryConfig: true })
    const pro = generateAlertPresetRules('battery', 'pro', { hasBatteryConfig: true })

    expect(safe.length).toBeGreaterThan(normal.length)
    expect(normal.length).toBeGreaterThan(pro.length)

    const firstPoint = (rules: { threshold: number }[]) => rules[0].threshold
    expect(firstPoint(safe)).toBeGreaterThan(firstPoint(pro))

    // Temperature direction is "above": earlier protection == a lower temperature.
    const safeTemp = generateAlertPresetRules('motor-temp', 'safe')
    const proTemp = generateAlertPresetRules('motor-temp', 'pro')
    expect(safeTemp.length).toBeGreaterThan(proTemp.length)
    expect(safeTemp[0].threshold).toBeLessThan(proTemp[0].threshold)
  })

  test('battery with no valid config produces no rules', () => {
    expect(generateAlertPresetRules('battery', 'safe', { hasBatteryConfig: false })).toEqual([])
    expect(generateAlertPresetRules('battery', 'safe')).toEqual([])
  })

  test('temperature presets do not require a battery config', () => {
    expect(generateAlertPresetRules('motor-temp', 'normal').length).toBeGreaterThan(0)
    expect(generateAlertPresetRules('controller-temp', 'normal').length).toBeGreaterThan(0)
  })

  test('motor-temp and controller-temp generate independently with distinct sound types', () => {
    const motor = generateAlertPresetRules('motor-temp', 'normal')
    const controller = generateAlertPresetRules('controller-temp', 'normal')

    expect(motor.every((r) => r.controlId === 'motor-temp')).toBe(true)
    expect(controller.every((r) => r.controlId === 'controller-temp')).toBe(true)
    expect(motor[0].soundType).not.toBe(controller[0].soundType)
  })
})

describe('generateAlertPresetRules — speed / duty (geiger)', () => {
  test('duty emits a single fixed-ceiling range whose start drops with protection', () => {
    const safe = generateAlertPresetRules('duty', 'safe')
    const normal = generateAlertPresetRules('duty', 'normal')
    const pro = generateAlertPresetRules('duty', 'pro')

    for (const rules of [safe, normal, pro]) {
      expect(rules).toHaveLength(1)
      expect(rules[0].thresholdMax).not.toBeNull()
      expect(rules[0].soundType).toBe(ALERT_PRESET_GEIGER_SOUND_TYPE)
    }

    // Fixed ceiling across levels; start drops as protection increases.
    expect(safe[0].thresholdMax).toBe(normal[0].thresholdMax)
    expect(normal[0].thresholdMax).toBe(pro[0].thresholdMax)
    expect(safe[0].threshold).toBeLessThan(normal[0].threshold)
    expect(normal[0].threshold).toBeLessThan(pro[0].threshold)
  })

  test('speed thresholds resolve as a percentage of Rider Top Speed', () => {
    const at50 = generateAlertPresetRules('speed', 'normal', { riderTopSpeedKmh: 50 })
    const at100 = generateAlertPresetRules('speed', 'normal', { riderTopSpeedKmh: 100 })

    expect(at50).toHaveLength(1)
    expect(at100).toHaveLength(1)
    // Doubling top speed doubles the resolved thresholds.
    expect(at100[0].threshold).toBe(at50[0].threshold * 2)
    expect(at100[0].thresholdMax).toBe((at50[0].thresholdMax ?? 0) * 2)
    expect(at50[0].thresholdMax).toBeGreaterThan(at50[0].threshold)
  })

  test('speed with missing or zero top speed produces no rules', () => {
    expect(generateAlertPresetRules('speed', 'normal')).toEqual([])
    expect(generateAlertPresetRules('speed', 'normal', { riderTopSpeedKmh: 0 })).toEqual([])
    expect(generateAlertPresetRules('speed', 'normal', { riderTopSpeedKmh: null })).toEqual([])
    expect(generateAlertPresetRules('speed', 'normal', { riderTopSpeedKmh: NaN })).toEqual([])
  })
})

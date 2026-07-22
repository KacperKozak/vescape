import { beforeEach, expect, mock, test } from 'bun:test'
import type { AlertRule, Board } from 'vescape-core'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

const updateSetting = mock(async () => {})
const upsertAlertRule = mock(async () => {})
const deleteAlertRule = mock(async () => {})
const getAlertRules = mock(async () => [] as AlertRule[])

mock.module('vescape-core', () => ({
  ...actualVescapeCore,
  updateSetting,
  upsertAlertRule,
  deleteAlertRule,
  getAlertRules,
}))

const BATTERY_BOARD = {
  id: 'board-1',
  batteryConfig: { mode: 'manual', minVoltage: 40, maxVoltage: 50 },
} as unknown as Board

async function setup(overrides?: { riderTopSpeedKmh?: number; seedRules?: AlertRule[] }) {
  const { useSettingsStore } = await import('@/modules/settings/store/settingsStore')
  const { useAlertsStore } = await import('@/modules/alerts/store/alertsStore')
  const { useBoardStore } = await import('@/modules/board/store/boardStore')
  const { useAlertPresetStore } = await import('@/modules/alerts/store/alertPresetStore')

  useSettingsStore.setState({
    riderTopSpeedKmh: overrides?.riderTopSpeedKmh ?? 40,
    alertPreset: null,
    setAlertPreset: useSettingsStore.getInitialState().setAlertPreset,
  })
  useAlertsStore.setState({ rules: overrides?.seedRules ?? [] })
  useBoardStore.setState({ boards: [BATTERY_BOARD], activeBoardId: 'board-1' })

  return { useSettingsStore, useAlertsStore, useAlertPresetStore }
}

const presetRules = (rules: AlertRule[], controlId: string) =>
  rules.filter((rule) => rule.source === 'preset' && rule.controlId === controlId)

beforeEach(() => {
  updateSetting.mockClear()
  upsertAlertRule.mockClear()
  deleteAlertRule.mockClear()
})

test('setting a level persists the selection and generates deterministically-ided preset rules', async () => {
  const { useAlertsStore, useAlertPresetStore } = await setup()

  await useAlertPresetStore.getState().setLevel('battery', 'normal')

  expect(updateSetting).toHaveBeenCalledWith(
    'alertPreset',
    expect.objectContaining({ battery: 'normal' }),
  )

  const rules = presetRules(useAlertsStore.getState().rules, 'battery')
  expect(rules.length).toBeGreaterThan(0)
  expect(rules.map((rule) => rule.id)).toEqual(rules.map((_, index) => `preset:battery:${index}`))
  for (const rule of rules) {
    expect(rule.source).toBe('preset')
    expect(rule.enabled).toBe(true)
  }
})

test('changing a level regenerates that metric wholesale', async () => {
  const { useAlertsStore, useAlertPresetStore } = await setup()

  await useAlertPresetStore.getState().setLevel('battery', 'safe')
  const safeCount = presetRules(useAlertsStore.getState().rules, 'battery').length

  await useAlertPresetStore.getState().setLevel('battery', 'pro')
  const proRules = presetRules(useAlertsStore.getState().rules, 'battery')

  // safe declares more points than pro, so regeneration must shrink the set, not append.
  expect(safeCount).toBeGreaterThan(proRules.length)
  expect(proRules.map((rule) => rule.id)).toEqual(
    proRules.map((_, index) => `preset:battery:${index}`),
  )
  expect(deleteAlertRule).toHaveBeenCalled()
})

test('off removes a metric preset rules entirely', async () => {
  const { useAlertsStore, useAlertPresetStore } = await setup()

  await useAlertPresetStore.getState().setLevel('battery', 'normal')
  expect(presetRules(useAlertsStore.getState().rules, 'battery').length).toBeGreaterThan(0)

  await useAlertPresetStore.getState().setLevel('battery', 'off')
  expect(presetRules(useAlertsStore.getState().rules, 'battery')).toHaveLength(0)
})

test('manual rules and other metrics survive a preset regeneration', async () => {
  const manual: AlertRule = {
    id: 'manual-1',
    controlId: 'battery',
    threshold: 33,
    thresholdMax: null,
    enabled: true,
    soundType: 'preset:beep',
    createdAt: 1,
    source: 'manual',
  }
  const otherPreset: AlertRule = {
    id: 'preset:duty:0',
    controlId: 'duty',
    threshold: 70,
    thresholdMax: 90,
    enabled: true,
    soundType: 'preset:tick',
    createdAt: 1,
    source: 'preset',
  }
  const { useAlertsStore, useAlertPresetStore } = await setup({ seedRules: [manual, otherPreset] })

  await useAlertPresetStore.getState().setLevel('battery', 'normal')

  const rules = useAlertsStore.getState().rules
  expect(rules.find((rule) => rule.id === 'manual-1')).toEqual(manual)
  expect(rules.find((rule) => rule.id === 'preset:duty:0')).toEqual(otherPreset)
})

test('changing Rider Top Speed regenerates the speed preset thresholds', async () => {
  const { useSettingsStore, useAlertsStore, useAlertPresetStore } = await setup({
    riderTopSpeedKmh: 40,
  })

  await useAlertPresetStore.getState().setLevel('speed', 'normal')
  const at40 = presetRules(useAlertsStore.getState().rules, 'speed')[0]!

  useSettingsStore.setState({ riderTopSpeedKmh: 100 })
  await useAlertPresetStore.getState().regenerateSpeed()
  const at100 = presetRules(useAlertsStore.getState().rules, 'speed')[0]!

  expect(at100.threshold).toBeGreaterThan(at40.threshold)
  expect(at100.thresholdMax).toBe(90) // 0.9 * 100
})

test('battery preset generates nothing without a valid board battery config', async () => {
  const { useAlertsStore, useAlertPresetStore } = await setup()
  const { useBoardStore } = await import('@/modules/board/store/boardStore')
  useBoardStore.setState({ boards: [], activeBoardId: null })

  await useAlertPresetStore.getState().setLevel('battery', 'normal')

  expect(presetRules(useAlertsStore.getState().rules, 'battery')).toHaveLength(0)
})

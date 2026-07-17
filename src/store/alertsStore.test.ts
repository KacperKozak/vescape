import { beforeEach, describe, expect, mock, test } from 'bun:test'

const nativeRules: unknown[] = []
const upsertAlertRule = mock(async (rule: unknown) => {
  const existing = nativeRules.findIndex((candidate) => {
    return (
      candidate != null &&
      typeof candidate === 'object' &&
      'id' in candidate &&
      candidate.id === (rule as { id?: string }).id
    )
  })
  if (existing >= 0) nativeRules[existing] = rule
  else nativeRules.push(rule)
})
const setAlertRuleEnabled = mock(async (id: string, enabled: boolean) => {
  const rule = nativeRules.find((candidate) => {
    return (
      candidate != null && typeof candidate === 'object' && 'id' in candidate && candidate.id === id
    )
  }) as { enabled?: boolean } | undefined
  if (rule) rule.enabled = enabled
})

mock.module('vesc-ble', () => ({
  getAlertRules: async () => [...nativeRules],
  upsertAlertRule,
  setAlertRuleEnabled,
  deleteAlertRule: async () => undefined,
  getSettings: async () => ({}),
  updateSetting: async () => undefined,
  setCompanionPresenceEnabled: async () => undefined,
}))

const { useAlertsStore } = await import('@/store/alertsStore')
const { LEGAL_MODE_ALERT_RULE_ID, legalModeAlertRule, DEFAULT_LEGAL_MODE_SETTINGS } =
  await import('@/lib/legalMode')

describe('alertsStore generated Legal Mode rule', () => {
  beforeEach(() => {
    nativeRules.length = 0
    upsertAlertRule.mockClear()
    setAlertRuleEnabled.mockClear()
    useAlertsStore.setState({ rules: [] })
  })

  test('upserts one stable Legal Mode alert rule and updates thresholds', async () => {
    await useAlertsStore
      .getState()
      .upsert(legalModeAlertRule({ ...DEFAULT_LEGAL_MODE_SETTINGS, enabled: true }, 100))
    await useAlertsStore
      .getState()
      .upsert(
        legalModeAlertRule(
          { ...DEFAULT_LEGAL_MODE_SETTINGS, enabled: true, legalSpeedKmh: 25, warningSpeedKmh: 20 },
          100,
        ),
      )

    expect(useAlertsStore.getState().rules).toHaveLength(1)
    expect(useAlertsStore.getState().rules[0]).toMatchObject({
      id: LEGAL_MODE_ALERT_RULE_ID,
      threshold: 20,
      thresholdMax: 25,
      enabled: true,
    })
    expect(upsertAlertRule).toHaveBeenCalledTimes(2)
  })

  test('disables generated alert without deleting it', async () => {
    await useAlertsStore
      .getState()
      .upsert(legalModeAlertRule({ ...DEFAULT_LEGAL_MODE_SETTINGS, enabled: true }, 100))
    await useAlertsStore.getState().setEnabled(LEGAL_MODE_ALERT_RULE_ID, false)

    expect(useAlertsStore.getState().rules[0]).toMatchObject({
      id: LEGAL_MODE_ALERT_RULE_ID,
      enabled: false,
    })
    expect(setAlertRuleEnabled).toHaveBeenCalledWith(LEGAL_MODE_ALERT_RULE_ID, false)
  })
})

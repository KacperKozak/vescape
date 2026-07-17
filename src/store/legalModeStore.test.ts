import { beforeEach, expect, mock, test } from 'bun:test'
import type { AppSettings } from 'vesc-ble'

import { DEFAULT_LEGAL_MODE_SETTINGS } from '@/lib/legalMode'

const actualVescBle = await import('../../modules/vesc-ble/src/index')

const BASE: AppSettings = {
  liveHistoryLimit: 5,
  autoConnect: true,
  autoRecording: false,
  selectedBoardId: null,
  lastGpsLatitude: null,
  lastGpsLongitude: null,
  movingSpeedThresholdKmh: 3,
  freeSpinMaxSpeedDeltaKmh: 12,
  freeSpinStationaryBoardCapKmh: 15,
  mapStyleKey: 'onedark',
  mapNavigationMode: 'northUp',
  historyMetricGradientsEnabled: true,
  historyMetricHotRanges: {},
  socEstimateWindowSeconds: 20,
  connectionSoundsEnabled: true,
  companionPresenceEnabled: false,
  boardWarningsEnabled: true,
  companionPresenceCooldownMinutes: 60,
  autoCloseEnabled: false,
  autoCloseDelayMinutes: 15,
  telemetryPollRateHz: 20,
  wearMirrorIntervalMs: 500,
  wearAutoLaunchOnConnect: true,
  riderId: null,
  riderName: null,
  riderColor: null,
  legalMode: DEFAULT_LEGAL_MODE_SETTINGS as unknown as Record<string, unknown>,
}

const updateSetting = mock(async () => {})
const upsertAlertRule = mock(async () => {})
const deleteAlertRule = mock(async () => {})

mock.module('vesc-ble', () => ({
  ...actualVescBle,
  updateSetting,
  upsertAlertRule,
  deleteAlertRule,
}))

beforeEach(async () => {
  updateSetting.mockClear()
  upsertAlertRule.mockClear()
  deleteAlertRule.mockClear()

  const { useSettingsStore } = await import('./settingsStore')
  useSettingsStore.setState({
    ...BASE,
    loaded: true,
    load: useSettingsStore.getInitialState().load,
    set: useSettingsStore.getInitialState().set,
    setLegalMode: useSettingsStore.getInitialState().setLegalMode,
    setCompanionPresence: useSettingsStore.getInitialState().setCompanionPresence,
  })
})

test('enabling legal mode materializes a managed native speed warning alert', async () => {
  const { useLegalModeStore } = await import('./legalModeStore')

  await useLegalModeStore.getState().setEnabled(true)

  expect(updateSetting).toHaveBeenCalledWith(
    'legalMode',
    expect.objectContaining({ enabled: true }),
  )
  expect(upsertAlertRule).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'legal-mode-speed-alert',
      controlId: 'speed',
      threshold: 15,
      thresholdMax: 20,
      enabled: true,
      source: 'legal-mode',
    }),
  )
})

test('disabling legal mode deletes only the managed native warning alert', async () => {
  const { useLegalModeStore } = await import('./legalModeStore')

  await useLegalModeStore.getState().setEnabled(false)

  expect(deleteAlertRule).toHaveBeenCalledWith('legal-mode-speed-alert')
})

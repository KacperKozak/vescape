import { beforeEach, expect, mock, test } from 'bun:test'
import type { AppSettings } from 'vescape-core'

import {
  DEFAULT_LEGAL_MODE_SETTINGS,
  legalJurisdictionResultFromCountryCode,
} from '@/modules/legal/lib/legalMode'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')

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
  satelliteOverlayEnabled: true,
  satelliteImageryOpacity: 0.2,
  satelliteMapImageryOpacity: 1,
  satelliteImagerySaturation: -0.35,
  hideTelemetryMapDetails: true,
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
  dismissedCommunityMessageIds: [],
}

const updateSetting = mock(async () => {})
const upsertAlertRule = mock(async () => {})
const deleteAlertRule = mock(async () => {})

mock.module('vescape-core', () => ({
  ...actualVescapeCore,
  updateSetting,
  upsertAlertRule,
  deleteAlertRule,
}))

beforeEach(async () => {
  updateSetting.mockClear()
  upsertAlertRule.mockClear()
  deleteAlertRule.mockClear()

  const { useSettingsStore } = await import('@/modules/settings/store/settingsStore')
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
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

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

test('editing legal mode speeds persists settings and updates the managed alert thresholds', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled(true)
  await useLegalModeStore.getState().setSpeeds(30, 24)

  expect(updateSetting).toHaveBeenLastCalledWith(
    'legalMode',
    expect.objectContaining({
      enabled: true,
      legalSpeedKmh: 30,
      warningSpeedKmh: 24,
      warningManuallyEdited: true,
    }),
  )
  expect(upsertAlertRule).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: 'legal-mode-speed-alert',
      controlId: 'speed',
      threshold: 24,
      thresholdMax: 30,
      enabled: true,
      source: 'legal-mode',
    }),
  )
})

test('editing only the legal warning speed updates the managed alert threshold', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled(true)
  await useLegalModeStore.getState().setWarningSpeed(18)

  expect(updateSetting).toHaveBeenLastCalledWith(
    'legalMode',
    expect.objectContaining({
      enabled: true,
      legalSpeedKmh: 20,
      warningSpeedKmh: 18,
      warningManuallyEdited: true,
    }),
  )
  expect(upsertAlertRule).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: 'legal-mode-speed-alert',
      threshold: 18,
      thresholdMax: 20,
      enabled: true,
    }),
  )
})

test('re-enabling legal mode resets speeds to defaults when current jurisdiction is not applicable', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')
  const { useSettingsStore } = await import('@/modules/settings/store/settingsStore')

  useSettingsStore.setState({
    legalMode: {
      ...DEFAULT_LEGAL_MODE_SETTINGS,
      enabled: true,
      legalSpeedKmh: 30,
      warningSpeedKmh: 24,
      warningManuallyEdited: true,
      jurisdiction: legalJurisdictionResultFromCountryCode('DE'),
    } as unknown as Record<string, unknown>,
  })

  await useLegalModeStore.getState().setEnabled(false)
  await useLegalModeStore.getState().setEnabled(true)

  expect(updateSetting).toHaveBeenLastCalledWith(
    'legalMode',
    expect.objectContaining({
      enabled: true,
      legalSpeedKmh: 20,
      warningSpeedKmh: 15,
      warningManuallyEdited: false,
      jurisdiction: null,
    }),
  )
  expect(upsertAlertRule).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: 'legal-mode-speed-alert',
      threshold: 15,
      thresholdMax: 20,
      enabled: true,
    }),
  )
})

test('disabling legal mode deletes only the managed native warning alert', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled(false)

  expect(deleteAlertRule).toHaveBeenCalledWith('legal-mode-speed-alert')
  expect(deleteAlertRule).toHaveBeenCalledTimes(1)
  expect(upsertAlertRule).not.toHaveBeenCalled()
})

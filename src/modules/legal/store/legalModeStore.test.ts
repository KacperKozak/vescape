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
}

const updateSetting = mock(async () => {})

mock.module('vescape-core', () => ({
  ...actualVescapeCore,
  updateSetting,
}))

beforeEach(async () => {
  updateSetting.mockClear()

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

test('enabling legal mode only persists its native App Setting', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled(true)

  expect(updateSetting).toHaveBeenCalledWith(
    'legalMode',
    expect.objectContaining({ enabled: true }),
  )
})

test('editing legal mode speeds persists the native overlay thresholds', async () => {
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
})

test('editing only the legal warning speed persists the native overlay threshold', async () => {
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
})

test('disabling legal mode persists the disabled App Setting', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled(false)

  expect(updateSetting).toHaveBeenCalledWith(
    'legalMode',
    expect.objectContaining({ enabled: false }),
  )
})

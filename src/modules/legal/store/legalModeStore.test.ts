import { beforeEach, expect, mock, test } from 'bun:test'
import type { AppSettings } from 'vescape-core'

import { DEFAULT_LEGAL_MODE_SETTINGS } from '@/modules/legal/lib/legalMode'

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
  legalPolicy: null,
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

  expect(updateSetting).toHaveBeenCalledWith('legalMode', { enabled: true })
})

test('disabling legal mode persists the disabled App Setting', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled(false)

  expect(updateSetting).toHaveBeenCalledWith('legalMode', { enabled: false })
})

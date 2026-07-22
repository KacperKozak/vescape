import { create } from 'zustand'

import { deriveBatteryConfig } from '@/modules/battery/lib'
import { useBoardStore } from '@/modules/board/store/boardStore'
import {
  ALERT_PRESET_SOURCE,
  DEFAULT_ALERT_PRESET_SELECTION,
  generateAlertPresetRules,
  isPresetAlertRule,
  normalizeAlertPresetSelection,
  presetAlertRuleId,
  type AlertPresetLevel,
  type AlertPresetMetric,
  type AlertPresetSelection,
} from '@/modules/alerts/lib/alertPresets'
import { useAlertsStore } from '@/modules/alerts/store/alertsStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

interface AlertPresetState {
  syncing: boolean
}

interface AlertPresetActions {
  /** Persist a metric's level, then regenerate that metric's preset rules wholesale. */
  setLevel(metric: AlertPresetMetric, level: AlertPresetLevel): Promise<void>
  /** Regenerate one metric's preset rules from the persisted selection (no settings write). */
  regenerate(metric: AlertPresetMetric): Promise<void>
  /** Rebuild the speed preset after Rider Top Speed changes. */
  regenerateSpeed(): Promise<void>
}

// Serialize regeneration so an interleaved Rider Top Speed change and level change can't race the
// delete-then-upsert and leave a metric's preset rules half-written.
let syncQueue: Promise<void> = Promise.resolve()

export const useAlertPresetStore = create<AlertPresetState & AlertPresetActions>((set, get) => ({
  syncing: false,

  async setLevel(metric, level) {
    const selection = getAlertPresetSelection()
    await useSettingsStore.getState().setAlertPreset({ ...selection, [metric]: level })
    await get().regenerate(metric)
  },

  async regenerate(metric) {
    const run = syncQueue.then(() => regenerateMetric(metric, set))
    syncQueue = run.catch(() => undefined)
    await run
  },

  async regenerateSpeed() {
    await get().regenerate('speed')
  },
}))

function getAlertPresetSelection(): AlertPresetSelection {
  return normalizeAlertPresetSelection(
    useSettingsStore.getState().alertPreset ?? DEFAULT_ALERT_PRESET_SELECTION,
  )
}

async function regenerateMetric(
  metric: AlertPresetMetric,
  set: (partial: Partial<AlertPresetState>) => void,
): Promise<void> {
  set({ syncing: true })
  try {
    const specs = generateAlertPresetRules(metric, getAlertPresetSelection()[metric], {
      riderTopSpeedKmh: useSettingsStore.getState().riderTopSpeedKmh,
      hasBatteryConfig: activeBoardHasBatteryConfig(),
    })

    // Delete-then-upsert scoped to this metric's preset rules, so other metrics' preset rules and
    // every manual rule survive untouched. `off` (empty specs) therefore just removes them.
    const alerts = useAlertsStore.getState()
    const stale = alerts.rules.filter(
      (rule) => rule.controlId === metric && isPresetAlertRule(rule),
    )
    for (const rule of stale) await useAlertsStore.getState().remove(rule.id)

    const createdAt = Date.now()
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index]!
      await useAlertsStore.getState().upsert({
        id: presetAlertRuleId(metric, index),
        controlId: spec.controlId,
        threshold: spec.threshold,
        thresholdMax: spec.thresholdMax,
        enabled: true,
        soundType: spec.soundType,
        createdAt,
        source: ALERT_PRESET_SOURCE,
      })
    }
  } finally {
    set({ syncing: false })
  }
}

function activeBoardHasBatteryConfig(): boolean {
  const board = useBoardStore
    .getState()
    .boards.find((b) => b.id === useBoardStore.getState().activeBoardId)
  return deriveBatteryConfig(board?.batteryConfig ?? null).warning == null
}

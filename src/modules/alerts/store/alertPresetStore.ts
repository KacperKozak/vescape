import { create } from 'zustand'
import type { Board } from 'vescape-core'

import {
  ALERT_PRESET_METRICS,
  ALERT_PRESET_SOURCE,
  generateAlertPresetRules,
  isPresetAlertRule,
  presetAlertRuleId,
  type AlertPresetLevel,
  type AlertPresetMetric,
} from '@/modules/alerts/lib/alertPresets'
import {
  boardAlertPresetSelection,
  boardHasBatteryConfig,
  boardTopSpeedKmh,
} from '@/modules/alerts/lib/boardAlertSettings'
import { useAlertsStore } from '@/modules/alerts/store/alertsStore'
import { useBoardStore } from '@/modules/board/store/boardStore'

interface AlertPresetState {
  syncing: boolean
}

interface AlertPresetActions {
  /** Persist a metric's level on the active Board, then regenerate that metric's preset rules. */
  setLevel(metric: AlertPresetMetric, level: AlertPresetLevel): Promise<void>
  /** Regenerate one metric's preset rules from the active Board's persisted selection (no write). */
  regenerate(metric: AlertPresetMetric): Promise<void>
  /** Rebuild the speed preset after Board Top Speed changes. */
  regenerateSpeed(): Promise<void>
  /** Regenerate every metric's preset rules for the active Board (used after add-board setup). */
  regenerateAll(): Promise<void>
}

// Serialize regeneration so an interleaved Board Top Speed change and level change can't race the
// delete-then-upsert and leave a metric's preset rules half-written.
let syncQueue: Promise<void> = Promise.resolve()

export const useAlertPresetStore = create<AlertPresetState & AlertPresetActions>((set, get) => ({
  syncing: false,

  async setLevel(metric, level) {
    const board = activeBoard()
    if (!board) return
    const selection = boardAlertPresetSelection(board)
    await useBoardStore
      .getState()
      .updateBoard({ ...board, alertPreset: { ...selection, [metric]: level } })
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

  async regenerateAll() {
    for (const metric of ALERT_PRESET_METRICS) await get().regenerate(metric)
  },
}))

function activeBoard(): Board | undefined {
  const { boards, activeBoardId } = useBoardStore.getState()
  return boards.find((b) => b.id === activeBoardId)
}

async function regenerateMetric(
  metric: AlertPresetMetric,
  set: (partial: Partial<AlertPresetState>) => void,
): Promise<void> {
  const board = activeBoard()
  // The alerts store mirrors the active Board's rules; only regenerate when they line up, so preset
  // rules never leak onto the wrong Board.
  if (!board || useAlertsStore.getState().boardId !== board.id) return

  set({ syncing: true })
  try {
    const specs = generateAlertPresetRules(metric, boardAlertPresetSelection(board)[metric], {
      riderTopSpeedKmh: boardTopSpeedKmh(board),
      hasBatteryConfig: boardHasBatteryConfig(board),
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
        boardId: board.id,
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

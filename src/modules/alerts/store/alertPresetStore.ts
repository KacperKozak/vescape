import { create } from 'zustand'
import { deleteAlertRule, getAlertRules, type Board } from 'vescape-core'

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
  /** Persist a metric's level, then regenerate that Board's preset rules. Defaults to active. */
  setLevel(metric: AlertPresetMetric, level: AlertPresetLevel, boardId?: string): Promise<void>
  /** Regenerate one metric's preset rules from persisted selection. Defaults to active Board. */
  regenerate(metric: AlertPresetMetric, boardId?: string): Promise<void>
  /** Rebuild the speed preset after Board Top Speed changes. */
  regenerateSpeed(boardId?: string): Promise<void>
  /** Regenerate every metric's preset rules for a Board (used after add-board setup). */
  regenerateAll(boardId?: string): Promise<void>
}

// Serialize regeneration so an interleaved Board Top Speed change and level change can't race the
// delete-then-upsert and leave a metric's preset rules half-written.
let syncQueue: Promise<void> = Promise.resolve()

export const useAlertPresetStore = create<AlertPresetState & AlertPresetActions>((set, get) => ({
  syncing: false,

  async setLevel(metric, level, boardId) {
    const board = targetBoard(boardId)
    if (!board) return
    const selection = boardAlertPresetSelection(board)
    await useBoardStore
      .getState()
      .updateBoard({ ...board, alertPreset: { ...selection, [metric]: level } })
    await get().regenerate(metric, board.id)
  },

  async regenerate(metric, boardId) {
    const targetId = targetBoard(boardId)?.id
    if (!targetId) return
    const run = syncQueue.then(() => regenerateMetric(targetId, metric, set))
    syncQueue = run.catch(() => undefined)
    await run
  },

  async regenerateSpeed(boardId) {
    await get().regenerate('speed', boardId)
  },

  async regenerateAll(boardId) {
    for (const metric of ALERT_PRESET_METRICS) await get().regenerate(metric, boardId)
  },
}))

function targetBoard(boardId?: string): Board | undefined {
  const { boards, activeBoardId } = useBoardStore.getState()
  return boards.find((b) => b.id === (boardId ?? activeBoardId))
}

async function regenerateMetric(
  boardId: string,
  metric: AlertPresetMetric,
  set: (partial: Partial<AlertPresetState>) => void,
): Promise<void> {
  const board = targetBoard(boardId)
  if (!board) return

  set({ syncing: true })
  try {
    const specs = generateAlertPresetRules(metric, boardAlertPresetSelection(board)[metric], {
      boardTopSpeedKmh: boardTopSpeedKmh(board),
      hasBatteryConfig: boardHasBatteryConfig(board),
    })

    // Delete-then-upsert scoped to this metric's preset rules, so other metrics' preset rules and
    // every manual rule survive untouched. `off` (empty specs) therefore just removes them.
    const loadedAlerts = useAlertsStore.getState()
    const rules =
      loadedAlerts.boardId === board.id ? loadedAlerts.rules : await getAlertRules(board.id)
    const stale = rules.filter((rule) => rule.controlId === metric && isPresetAlertRule(rule))
    for (const rule of stale) await deleteAlertRule(board.id, rule.id)
    if (useAlertsStore.getState().boardId === board.id && stale.length > 0) {
      const staleIds = new Set(stale.map((rule) => rule.id))
      useAlertsStore.setState((state) => ({
        rules: state.rules.filter((rule) => !staleIds.has(rule.id)),
      }))
    }

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

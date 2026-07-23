import { create } from 'zustand'
import {
  deleteAlertRule,
  getAlertRules,
  setAlertRuleEnabled,
  type AlertRule,
  type AlertSoundType,
  upsertAlertRule,
} from 'vescape-core'
import { generateId } from '@/helpers/id'

export type { AlertRule, AlertSoundType } from 'vescape-core'

interface AlertsState {
  /**
   * The Board whose rules are currently loaded. Alert Rules are owned by one Board (#254) and the
   * native alert engine evaluates only the connected Board's rules — so the store mirrors exactly
   * the active Board's rules, and reloads whenever the active Board changes. `null` ⇒ no Board.
   */
  boardId: string | null
  rules: AlertRule[]
}

interface AlertsActions {
  /** Bind the store to a Board and load its rules. `null` clears to an empty rule set. */
  load(boardId: string | null): Promise<void>
  add(
    controlId: string,
    threshold: number,
    thresholdMax?: number | null,
    soundType?: AlertSoundType,
  ): void
  update(
    id: string,
    threshold: number,
    thresholdMax: number | null,
    soundType: AlertSoundType,
  ): void
  upsert(rule: AlertRule): Promise<void>
  setEnabled(id: string, enabled: boolean): Promise<void>
  toggle(id: string): Promise<void>
  remove(id: string): Promise<void>
}

// Monotonic token so an older in-flight load() can never overwrite a newer one's result (even for
// the same Board — e.g. a reload racing a regeneration).
let loadGeneration = 0

export const useAlertsStore = create<AlertsState & AlertsActions>((set, get) => ({
  boardId: null,
  rules: [],

  async load(boardId) {
    const request = ++loadGeneration
    // Clear immediately on bind so the UI never shows the previous Board's rules as the new Board's
    // (their deterministic preset ids overlap, so a stray toggle/delete would target the wrong rows).
    set({ boardId, rules: [] })
    if (!boardId) return
    try {
      const rules = await getAlertRules(boardId)
      if (request === loadGeneration && get().boardId === boardId) set({ rules })
    } catch {
      if (request === loadGeneration && get().boardId === boardId) set({ rules: [] })
    }
  },

  add(controlId, threshold, thresholdMax = null, soundType = 'preset:beep') {
    const boardId = get().boardId
    if (!boardId) return
    const rule: AlertRule = {
      boardId,
      id: generateId(),
      controlId,
      threshold,
      thresholdMax: thresholdMax ?? null,
      enabled: true,
      soundType,
      createdAt: Date.now(),
    }
    set((s) => ({ rules: [...s.rules, rule] }))
    void upsertAlertRule(rule)
  },

  update(id, threshold, thresholdMax, soundType) {
    const rule = get().rules.find((r) => r.id === id)
    if (!rule) return
    const updated = { ...rule, threshold, thresholdMax, soundType }
    set((s) => ({ rules: s.rules.map((r) => (r.id === id ? updated : r)) }))
    void upsertAlertRule(updated)
  },

  async upsert(rule) {
    // Only reflect the rule locally when it belongs to the bound Board; always persist natively.
    if (rule.boardId === get().boardId) {
      set((s) => {
        const exists = s.rules.some((r) => r.id === rule.id)
        return {
          rules: exists ? s.rules.map((r) => (r.id === rule.id ? rule : r)) : [...s.rules, rule],
        }
      })
    }
    await upsertAlertRule(rule)
  },

  async setEnabled(id, enabled) {
    const boardId = get().boardId
    if (!boardId) return
    set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) }))
    await setAlertRuleEnabled(boardId, id, enabled)
  },

  async toggle(id) {
    const rule = get().rules.find((r) => r.id === id)
    if (!rule) return
    await get().setEnabled(id, !rule.enabled)
  },

  async remove(id) {
    const boardId = get().boardId
    if (!boardId) return
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }))
    await deleteAlertRule(boardId, id)
  },
}))

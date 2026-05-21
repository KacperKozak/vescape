import { create } from 'zustand'
import {
  deleteAlertRule,
  getAlertRules,
  setAlertRuleEnabled,
  type AlertRule,
  type AlertSoundType,
  upsertAlertRule,
} from 'vesc-ble'

export type { AlertRule, AlertSoundType } from 'vesc-ble'

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

interface AlertsState {
  rules: AlertRule[]
}

interface AlertsActions {
  load(): Promise<void>
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
  toggle(id: string): Promise<void>
  remove(id: string): Promise<void>
}

export const useAlertsStore = create<AlertsState & AlertsActions>((set, get) => ({
  rules: [],

  async load() {
    set({ rules: await getAlertRules() })
  },

  add(controlId, threshold, thresholdMax = null, soundType = 'preset:beep') {
    const rule: AlertRule = {
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

  async toggle(id) {
    const rule = get().rules.find((r) => r.id === id)
    if (!rule) return
    const enabled = !rule.enabled
    set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) }))
    await setAlertRuleEnabled(id, enabled)
  },

  async remove(id) {
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }))
    await deleteAlertRule(id)
  },
}))

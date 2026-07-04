import { addAppDataChangedListener, type AppDataChangedEvent } from 'vesc-ble'

import { useBoardStore } from '@/store/boardStore'
import { useSettingsStore } from '@/store/settingsStore'

/**
 * Native owns durable app/board data; JS holds a rendered copy. Whenever native persists a change
 * on its own (e.g. the session-end `lastBattery`, a 30s GPS write), it emits `onAppDataChanged` and
 * JS reloads the matching store — so no app restart is ever needed to see fresh data.
 *
 * To keep a new store in sync: give its native writes a scope in `AppDataRepository` and add one
 * line here. Each store's `load()` is idempotent (diff-and-bail), so a reload that finds no change
 * costs nothing and never re-renders.
 */
const RELOADERS: Record<AppDataChangedEvent['scope'], () => void> = {
  boards: () => void useBoardStore.getState().load(),
  settings: () => void useSettingsStore.getState().load(),
}

/** Wire the single native->JS data listener. Call once at app root; returns an unsubscribe. */
export function startAppDataSync(): () => void {
  const sub = addAppDataChangedListener((event) => RELOADERS[event.scope]?.())
  return () => sub.remove()
}

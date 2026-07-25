import { AppState } from 'react-native'
import { create } from 'zustand'

import { addAppStatusListener, getAppStatus, type AppStatus } from 'vescape-core'

/**
 * JS mirror of native App Status. Native owns the truth — it fetches on foreground, coalesces
 * refreshes, and keeps the last success for the process; this store only projects that state and
 * remembers the Update Warning dismissal for the current cold launch.
 *
 * `status` is `null` until the first successful native fetch (fail-open), so a rider with no
 * connectivity sees no version UI at all.
 */
interface AppStatusState {
  /** Latest native App Status, or `null` when no successful fetch has landed this process. */
  status: AppStatus | null
  /**
   * Update Warning prompts the rider has dismissed for this cold launch. In-memory only — a fresh
   * process forgets it and the warning returns (PRD story 4). Never persisted.
   */
  updateWarningDismissed: boolean
  replace: (status: AppStatus | null) => void
  dismissUpdateWarning: () => void
}

export const useAppStatusStore = create<AppStatusState>((set) => ({
  status: null,
  updateWarningDismissed: false,
  replace: (status) => set({ status }),
  dismissUpdateWarning: () => set({ updateWarningDismissed: true }),
}))

/**
 * Wire the native → JS App Status mirror. Call once at app root; returns an unsubscribe.
 *
 * Mirrors `startAppDataSync`/`startBoardWarningsSync`:
 * - **Push:** live `onAppStatus` emits while JS is foregrounded and listening. Native replays the
 *   current status on subscribe, so a fresh listener starts consistent.
 * - **Pull:** a foreground catch-up. Native refreshes App Status on foreground; re-reading the
 *   current native value on `AppState -> active` picks up a status that changed while JS was away.
 */
export function startAppStatusSync(): () => void {
  const project = () => useAppStatusStore.getState().replace(getAppStatus())
  const sub = addAppStatusListener((event) => useAppStatusStore.getState().replace(event.status))
  project()
  const appStateSub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') project()
  })
  return () => {
    sub.remove()
    appStateSub.remove()
  }
}

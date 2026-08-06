/**
 * Build-time environment flags, and the intent-named booleans the app should actually branch on.
 *
 * Components read the intent (`showDevControls`), never the mode (`captureMode`): what a screen
 * cares about is whether rider-facing tooling belongs on screen, not which harness happens to be
 * driving it. Adding another capture mode later then changes one line here instead of every call
 * site.
 *
 * The E2E flag is deliberately not mirrored here — it lives in `vescape-core`, where it reroutes
 * board/telemetry reads to `e2eFake`, and duplicating it would invite the two copies to disagree.
 */

/**
 * Screenshot capture mode: a Release build with `EXPO_PUBLIC_SCREENSHOTS=1` and `EXPO_PUBLIC_E2E`
 * unset, driven by `scripts/screenshots.ts` to produce store-ready frames from the real app.
 *
 * Deliberately independent of the E2E flag: `e2eFake` would hide the native replay session the
 * screenshots depend on. Capture mode runs the production path end to end and only suppresses
 * developer-facing chrome.
 */
export const captureMode = process.env.EXPO_PUBLIC_SCREENSHOTS === '1'

/**
 * Whether rider-facing developer tooling belongs on screen: the REC control, the connection status
 * pill, the REPLAY badge, the development build badge.
 *
 * All of it is diagnostic, not product — a store frame shows the ride, not the instrumentation
 * around it.
 */
export const showDevControls = !captureMode

// Anything else a capture run changes — the invisible `map-settled` marker the runner waits on, the
// silenced render-rate canary — reads `captureMode` directly. Those are not questions about
// rider-facing tooling, and aliasing the flag under a second name would just be the same boolean
// wearing a hat.

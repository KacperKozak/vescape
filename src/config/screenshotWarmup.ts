/**
 * Replay warmup for a screenshot capture run: how much recorded ride the session opens with already
 * on the charts, and how much faster than real time native delivers it. 6 minutes at 30× costs
 * about twelve seconds of real waiting.
 *
 * The window is deliberately wider than `AppSettings.liveHistoryLimit` (5 minutes): the hero panel
 * then needs no wait beyond the warmup itself, and the charts show a stretch of ride rather than a
 * sparkline that only just reaches its own left edge.
 *
 * Its own file, not part of `@/config/screenshotMode`, because both the app and the Node runner
 * (`scripts/screenshots.ts`) read it — and the runner cannot import anything that reaches
 * `react-native`. Keeping it RN-free is what makes it one definition instead of a parity pair.
 */

export const SCREENSHOT_REPLAY_WARMUP_MS = 6 * 60_000
export const SCREENSHOT_REPLAY_WARMUP_SPEED = 30
/** Real time the warmup itself costs, which the capture run has to count against its wait. */
export const SCREENSHOT_REPLAY_WARMUP_WALL_MS =
  SCREENSHOT_REPLAY_WARMUP_MS / SCREENSHOT_REPLAY_WARMUP_SPEED

import { headingDeltaDeg, type PhoneHeadingAdapter } from '@/modules/map/lib/phoneHeading'

/** Share of the remaining turn taken per emitted tick — a first-order ease toward the target. */
const SIMULATED_HEADING_EASE_ALPHA = 0.06
/** Below this the ease is done; snapping the last fraction avoids an endless asymptotic crawl. */
const SIMULATED_HEADING_SETTLE_DEG = 0.05

function normalizeHeadingDeg(value: number): number {
  return ((value % 360) + 360) % 360
}

/**
 * A compass that reports a heading we supply instead of one a magnetometer measured. Used when the
 * device has no usable compass but the app still needs one — a replay on an emulator being the
 * case that matters: the ride has a course, the hardware has nothing.
 *
 * It stands in at the sensor boundary, encoding the heading back into the `rotation.alpha` a
 * DeviceMotion event would carry, so every consumer downstream — Compass follow rotation, the
 * heading cone, navigation diagnostics — runs its real code path and cannot tell the difference.
 *
 * A GPS course arrives about once a second and jumps between samples, where a real compass streams
 * a continuously moving angle. Emitting the raw course would swing the map in hard steps, so the
 * adapter eases toward it on every tick and hands the consumer that motion instead.
 */
export function createSimulatedPhoneHeadingAdapter(
  getHeadingDeg: () => number | null,
): PhoneHeadingAdapter {
  let intervalMs = 16
  let easedHeadingDeg: number | null = null
  return {
    isAvailableAsync: async () => true,
    getPermissionsAsync: async () => ({ status: 'granted' }),
    requestPermissionsAsync: async () => ({ status: 'granted' }),
    setUpdateInterval: (ms) => {
      intervalMs = ms
    },
    addListener: (listener) => {
      const timer = setInterval(() => {
        const targetHeadingDeg = getHeadingDeg()
        // No heading yet (standing still, no fix): emit nothing, exactly like a sensor that has
        // not produced a reading — the layer keeps its last value rather than snapping to north.
        if (targetHeadingDeg == null) return
        const delta =
          easedHeadingDeg == null ? 0 : headingDeltaDeg(easedHeadingDeg, targetHeadingDeg)
        // First reading has nothing to ease from, so it lands directly on the course.
        easedHeadingDeg =
          easedHeadingDeg == null || Math.abs(delta) < SIMULATED_HEADING_SETTLE_DEG
            ? normalizeHeadingDeg(targetHeadingDeg)
            : normalizeHeadingDeg(easedHeadingDeg + delta * SIMULATED_HEADING_EASE_ALPHA)
        listener({
          rotation: {
            // Inverse of `phoneHeadingFromDeviceMotion` at orientation 0.
            alpha: (-easedHeadingDeg * Math.PI) / 180,
            beta: 0,
            gamma: 0,
            timestamp: Date.now(),
          },
          orientation: 0,
        })
      }, intervalMs)
      return { remove: () => clearInterval(timer) }
    },
  }
}

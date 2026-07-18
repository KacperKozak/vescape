export interface RevealPan {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getResistedRevealPan(
  translationX: number,
  translationY: number,
  revealDistance: number,
  resistanceAtBreak: number,
): RevealPan {
  const distance = Math.hypot(translationX, translationY)
  const progress = Math.min(1, distance / revealDistance)
  const easedProgress = progress * (2 - progress)
  const panGain = 1 - resistanceAtBreak * easedProgress

  return {
    x: translationX * panGain,
    y: translationY * panGain,
  }
}

export function getBreakoutReleasePan(
  translationX: number,
  translationY: number,
  breakoutX: number,
  breakoutY: number,
  elapsedMs: number,
  durationMs: number,
): RevealPan {
  if (durationMs <= 0) {
    return { x: translationX, y: translationY }
  }

  const progress = clamp(elapsedMs / durationMs, 0, 1)
  const easedProgress = progress * progress * (3 - 2 * progress)

  return {
    x: breakoutX + (translationX - breakoutX) * easedProgress,
    y: breakoutY + (translationY - breakoutY) * easedProgress,
  }
}

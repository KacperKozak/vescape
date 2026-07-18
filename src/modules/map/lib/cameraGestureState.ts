const FOLLOW_GESTURE_CENTER_TOLERANCE_M = 80
const FOLLOW_GESTURE_HEADING_TOLERANCE_DEG = 5

function headingDeltaDeg(a: number, b: number): number {
  const delta = Math.abs(((((a - b) % 360) + 540) % 360) - 180)
  return Number.isFinite(delta) ? delta : 0
}

export function shouldPreserveLiveFollowGesture({
  followGps,
  historyActive,
  centerDistanceM,
  headingDeg,
  followHeadingDeg,
}: {
  followGps: boolean
  historyActive: boolean
  centerDistanceM: number
  headingDeg: number
  followHeadingDeg: number
}): boolean {
  return (
    followGps &&
    !historyActive &&
    centerDistanceM <= FOLLOW_GESTURE_CENTER_TOLERANCE_M &&
    headingDeltaDeg(headingDeg, followHeadingDeg) <= FOLLOW_GESTURE_HEADING_TOLERANCE_DEG
  )
}

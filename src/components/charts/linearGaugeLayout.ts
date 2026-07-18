const VALUE_MIN_W = 42
const VALUE_MIN_W_COMPACT = 36

export function getLinearGaugeValueSlot({
  width,
  headX,
  compact,
  gap,
}: {
  width: number
  headX: number
  compact?: boolean
  gap: number
}) {
  const minW = compact ? VALUE_MIN_W_COMPACT : VALUE_MIN_W
  const leftW = Math.max(0, headX - gap)
  const rightW = Math.max(0, width - headX - gap)

  if (leftW >= minW || rightW < minW) {
    return { left: 0, width: leftW, alignItems: 'flex-end' as const }
  }

  return { left: headX + gap, width: rightW, alignItems: 'flex-start' as const }
}

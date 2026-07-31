import { describe, expect, test } from 'bun:test'

import { accentColors } from '@/constants/theme'

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  )
}

describe('accent palettes', () => {
  test('every filled action pair meets AA text contrast in both appearances', () => {
    const failures: string[] = []
    for (const [appearance, palette] of Object.entries(accentColors)) {
      for (const [name, accent] of Object.entries(palette)) {
        const ratio = contrastRatio(accent.solid, accent.onSolid)
        if (ratio < 4.5) failures.push(`${appearance}.${name}: ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })
})

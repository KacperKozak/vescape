import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native'

import { font, palette, type FontWeight } from '@/constants/theme'

/** Map any RN `fontWeight` value to a shipped static Raleway weight.
 *  Defaults to 500 — Raleway's 400 regular reads too thin against the dark surface. */
const toFontWeight = (weight: TextStyle['fontWeight']): FontWeight => {
  if (weight === undefined) return '500'
  if (weight === 'bold') return '700'
  if (weight === 'normal') return '400'
  const n = Math.min(900, Math.max(300, Number(weight)))
  return String(Math.round(n / 100) * 100) as FontWeight
}

/**
 * App-wide `Text` wrapper. Resolves `fontWeight` from `style` to the matching
 * static Raleway family (`theme.font(weight)`) — Android cannot vary a custom
 * font's weight at render time, so each weight is a separate font file. Pass an
 * explicit `fontFamily` in `style` (`'monospace'` for readouts) to opt out.
 * Defaults `color` to the primary text token so unstyled text never falls back
 * to RN's black on the dark surface.
 */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style)
  const fontFamily = flat?.fontFamily ?? font(toFontWeight(flat?.fontWeight))
  return (
    <RNText
      style={[{ color: palette.slate.textPrimary }, style, { fontFamily, fontWeight: undefined }]}
      {...rest}
    />
  )
}

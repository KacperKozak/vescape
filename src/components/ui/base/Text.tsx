import { Text as RNText, type TextProps } from 'react-native'

import { font } from '@/constants/theme'

/**
 * App-wide `Text` wrapper. Injects `fontFamily: theme.font` (Raleway) and a
 * default `fontWeight: '500'` (Raleway's 400 regular reads too thin against the
 * dark surface). Pass an explicit `fontWeight` or `fontFamily` in `style`
 * (`'monospace'` for readouts, `'400'` for deliberately thin labels) to override.
 * Wraps every UI text instance so the font token stays a single source of truth.
 */
export function Text({ style, ...rest }: TextProps) {
  return <RNText style={[{ fontFamily: font, fontWeight: '500' }, style]} {...rest} />
}

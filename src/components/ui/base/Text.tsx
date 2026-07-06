import { Text as RNText, type TextProps } from 'react-native'

import { font } from '@/constants/theme'

/**
 * App-wide `Text` wrapper. Injects `fontFamily: theme.font` (Raleway) by default.
 * Pass an explicit `fontFamily` (`'monospace'` for readouts, or any other) to override.
 * Wraps every UI text instance so the font token stays a single source of truth.
 */
export function Text({ style, ...rest }: TextProps) {
  return <RNText style={[{ fontFamily: font }, style]} {...rest} />
}

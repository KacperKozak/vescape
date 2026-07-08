import type { ComponentProps } from 'react'
import { TextInput } from 'react-native'
import type { TextStyle } from 'react-native'
import Animated, { useAnimatedProps } from 'react-native-reanimated'

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

/**
 * Text driven by a shared/derived value string — updates on the UI thread with
 * zero React re-renders. Backed by a non-editable TextInput (the standard
 * Reanimated text trick). Animated styles may be passed in `style`.
 */
export function AnimatedValueText({
  text,
  style,
}: {
  text: { readonly value: string }
  style?: ComponentProps<typeof AnimatedTextInput>['style']
}) {
  const animatedProps = useAnimatedProps(() => {
    const value = text.value
    return { text: value, value, defaultValue: value }
  })
  return (
    <AnimatedTextInput
      editable={false}
      caretHidden
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[baseStyle, style]}
      animatedProps={animatedProps}
    />
  )
}

const baseStyle: TextStyle = {
  padding: 0,
  margin: 0,
}

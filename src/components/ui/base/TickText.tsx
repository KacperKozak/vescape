import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native'
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

interface TickTextProps {
  /** Live value driven off the UI thread; updates without re-rendering React. */
  value: SharedValue<number | null>
  decimals: number
  unit?: string
  style?: StyleProp<TextStyle>
}

/**
 * Renders a live numeric value from a Reanimated SharedValue at the tick rate (~31Hz) without
 * triggering React re-renders. Formatting runs on the UI thread, so only `decimals`/`unit`
 * (worklet-serializable primitives) are supported — keep it to plain numbers.
 */
export function TickText({ value, decimals, unit, style }: TickTextProps) {
  const animatedProps = useAnimatedProps(() => {
    'worklet'
    const v = value.value
    let text: string
    if (v == null || !Number.isFinite(v)) {
      text = '-'
    } else {
      const n = decimals === 0 ? Math.round(v).toString() : v.toFixed(decimals)
      text = unit ? `${n} ${unit}` : n
    }
    return { text, defaultValue: text }
  })

  return (
    <AnimatedTextInput
      editable={false}
      caretHidden
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[styles.reset, style]}
      animatedProps={animatedProps}
    />
  )
}

const styles = StyleSheet.create({
  reset: {
    padding: 0,
    margin: 0,
  },
})

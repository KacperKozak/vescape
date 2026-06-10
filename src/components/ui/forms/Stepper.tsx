import { MinusIcon, PlusIcon } from 'phosphor-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '@/constants/theme'
import { inputBase } from './Input'

interface StepperProps {
  value: number
  unit?: string
  min?: number
  max?: number
  onChange: (nextValue: number) => void
  fullWidth?: boolean
  testIDPrefix?: string
}

export function Stepper({
  value,
  unit,
  min,
  max,
  onChange,
  fullWidth = false,
  testIDPrefix,
}: StepperProps) {
  const decrementValue = min == null ? value - 1 : Math.max(min, value - 1)
  const incrementValue = max == null ? value + 1 : Math.min(max, value + 1)
  const canDecrement = min == null || value > min
  const canIncrement = max == null || value < max

  return (
    <View style={styles.stepper}>
      <Pressable
        style={[styles.stepperBtn, !canDecrement && styles.stepperBtnDisabled]}
        onPress={() => onChange(decrementValue)}
        disabled={!canDecrement}
        testID={testIDPrefix ? `${testIDPrefix}-decrement` : undefined}
      >
        <MinusIcon size={14} color={theme.neutral.textPrimary} weight="bold" />
      </Pressable>
      <View style={[styles.valueWrap, fullWidth && styles.fullWidthValueWrap]}>
        <Text style={styles.stepperValue}>{value}</Text>
        {unit ? <Text style={styles.stepperUnit}>{unit}</Text> : null}
      </View>
      <Pressable
        style={[styles.stepperBtn, !canIncrement && styles.stepperBtnDisabled]}
        onPress={() => onChange(incrementValue)}
        disabled={!canIncrement}
        testID={testIDPrefix ? `${testIDPrefix}-increment` : undefined}
      >
        <PlusIcon size={14} color={theme.neutral.textPrimary} weight="bold" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stepper: {
    ...inputBase,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 1,
  },
  stepperBtn: {
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  valueWrap: {
    minWidth: 31,
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 10,
  },
  fullWidthValueWrap: {
    flex: 1,
  },
  stepperValue: {
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  stepperUnit: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 0,
    lineHeight: 12,
    textAlign: 'center',
  },
})

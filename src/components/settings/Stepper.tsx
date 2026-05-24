import { MinusIcon, PlusIcon } from 'phosphor-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export function Stepper({
  value,
  onDecrement,
  onIncrement,
}: {
  value: string | number
  onDecrement: () => void
  onIncrement: () => void
}) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepperBtn} onPress={onDecrement}>
        <MinusIcon size={14} color="#f1f5f9" weight="bold" />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable style={styles.stepperBtn} onPress={onIncrement}>
        <PlusIcon size={14} color="#f1f5f9" weight="bold" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepperBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepperValue: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 58,
    textAlign: 'center',
  },
})

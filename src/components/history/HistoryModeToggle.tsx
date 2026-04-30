import { Pressable, StyleSheet, Text, View } from 'react-native'

type HistoryMode = 'list' | 'map'

interface HistoryModeToggleProps {
  mode: HistoryMode
  onChange: (mode: HistoryMode) => void
}

export function HistoryModeToggle({ mode, onChange }: HistoryModeToggleProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.button, mode === 'list' && styles.buttonActive]}
        onPress={() => onChange('list')}
      >
        <Text style={[styles.buttonText, mode === 'list' && styles.buttonTextActive]}>List</Text>
      </Pressable>
      <Pressable
        style={[styles.button, mode === 'map' && styles.buttonActive]}
        onPress={() => onChange('map')}
      >
        <Text style={[styles.buttonText, mode === 'map' && styles.buttonTextActive]}>Map</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 3,
    flexDirection: 'row',
    gap: 4,
  },
  button: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: '#2563eb',
  },
  buttonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonTextActive: {
    color: '#f8fafc',
  },
})

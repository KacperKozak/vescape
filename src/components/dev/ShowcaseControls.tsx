import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'

interface ToggleRowProps {
  label: string
  value: boolean
  onToggle: (v: boolean) => void
}

export function ToggleRow({ label, value, onToggle }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#334155', true: '#1d4ed8' }}
        thumbColor={value ? '#3b82f6' : '#64748b'}
        style={styles.toggleSwitch}
      />
    </View>
  )
}

interface ChipRowProps {
  label: string
  options: string[]
  selected: string
  onSelect: (v: string) => void
}

export function ChipRow({ label, options, selected, onSelect }: ChipRowProps) {
  return (
    <View style={styles.chipRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o}
            style={[styles.chip, o === selected && styles.chipActive]}
            onPress={() => onSelect(o)}
          >
            <Text style={[styles.chipText, o === selected && styles.chipTextActive]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

interface ValueRowProps {
  label: string
  value: string | number
}

export function ValueRow({ label, value }: ValueRowProps) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.valueDisplay}>{value}</Text>
    </View>
  )
}

interface OpenButtonProps {
  label?: string
  onPress: () => void
}

export function OpenButton({ label = 'Open Modal', onPress }: OpenButtonProps) {
  return (
    <Pressable style={styles.openBtn} onPress={onPress}>
      <Text style={styles.openBtnText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  toggleSwitch: {
    transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#3b82f6',
  },
  chipText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  chipTextActive: {
    color: '#e0f2fe',
  },
  openBtn: {
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  openBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  valueDisplay: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
})

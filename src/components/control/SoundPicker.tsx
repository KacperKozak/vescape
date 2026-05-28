import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { theme } from '@/constants/theme'
import { type AlertPreset, previewAlertSound } from 'vesc-ble'

interface SoundPickerProps {
  presets: AlertPreset[]
  selected: string
  onSelect: (uri: string) => void
}

export function SoundPicker({ presets, selected, onSelect }: SoundPickerProps) {
  return (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>SOUND</Text>
      <View style={styles.soundRow}>
        {presets.map((preset) => {
          const active = selected === preset.uri
          return (
            <TouchableOpacity
              key={preset.uri}
              style={[styles.soundOption, active && styles.soundOptionActive]}
              onPress={() => {
                onSelect(preset.uri)
                previewAlertSound(preset.uri)
              }}
            >
              <Text style={[styles.soundOptionText, active && styles.soundOptionTextActive]}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  formField: {
    gap: 6,
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  soundRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soundOption: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
  },
  soundOptionActive: {
    borderColor: theme.wheel.color,
    backgroundColor: theme.wheel.bg,
  },
  soundOptionText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  soundOptionTextActive: {
    color: '#f1f5f9',
  },
})

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useMemo, useState } from 'react'

import { Dropdown, useTriggerRef } from '@/components/ui/forms/Dropdown'
import { Select, type SelectOption } from '@/components/ui/forms/Select'
import { SoundPicker } from '@/components/ui/forms/SoundPicker'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { OpenButton } from '@/components/ui/dev/ShowcaseControls'

import { theme } from '@/constants/theme'
import type { AlertPreset } from 'vesc-ble'

function SelectShowcase() {
  const options: SelectOption[] = useMemo(
    () => [
      { label: 'Speed', value: 'speed' },
      { label: 'Duty Cycle', value: 'duty' },
      { label: 'Current', value: 'current' },
      { label: 'Temperature', value: 'temperature' },
    ],
    [],
  )
  const [value, setValue] = useState('speed')

  return (
    <ShowcaseCard name="Select">
      <Select options={options} value={value} onChange={setValue} placeholder="Choose metric…" />
    </ShowcaseCard>
  )
}

function DropdownShowcase() {
  const [visible, setVisible] = useState(false)
  const triggerRef = useTriggerRef()

  return (
    <ShowcaseCard
      name="Dropdown"
      controls={<OpenButton label="Open Dropdown" onPress={() => setVisible(true)} />}
    >
      <View ref={triggerRef} style={{ alignSelf: 'center' }}>
        <Text style={styles.previewHint}>Tap &quot;Open Dropdown&quot; below</Text>
      </View>
      <Dropdown
        visible={visible}
        triggerRef={triggerRef}
        onClose={() => setVisible(false)}
        minWidth={180}
      >
        <View style={{ padding: 12, gap: 8 }}>
          <Text style={styles.dropdownItem}>Profile</Text>
          <Text style={styles.dropdownItem}>Settings</Text>
          <Text style={[styles.dropdownItem, { color: theme.error.color }]}>Logout</Text>
        </View>
      </Dropdown>
    </ShowcaseCard>
  )
}

function SoundPickerShowcase() {
  const mockPresets: AlertPreset[] = useMemo(
    () => [
      { name: 'Chime', uri: 'chime', category: 'single' },
      { name: 'Alert', uri: 'alert', category: 'single' },
      { name: 'Beep', uri: 'beep', category: 'geiger' },
      { name: 'Pulse', uri: 'pulse', category: 'geiger' },
    ],
    [],
  )
  const [selected, setSelected] = useState('chime')

  return (
    <ShowcaseCard name="SoundPicker">
      <SoundPicker presets={mockPresets} selected={selected} onSelect={setSelected} />
    </ShowcaseCard>
  )
}

export default function FormsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SelectShowcase />
        <DropdownShowcase />
        <SoundPickerShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.neutral.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  previewHint: { color: theme.neutral.textDim, fontSize: 12, fontStyle: 'italic' },
  dropdownItem: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 4,
  },
})

import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useMemo, useState } from 'react'

import { ToolboxIcon } from 'phosphor-react-native'
import {
  FieldEditorPopover,
  type FieldEditorTarget,
} from '@/components/domain/tune/FieldEditorPopover'
import { useTriggerRef } from '@/components/ui/forms/Dropdown'
import { BasicSliderCell } from '@/components/ui/tune/BasicSliderCell'
import { TuneDial } from '@/components/ui/tune/TuneDial'
import { IconHero } from '@/components/ui/settings/IconHero'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow, ValueRow } from '@/components/ui/dev/ShowcaseControls'

import { theme } from '@/constants/theme'
import type { BasicSliderItem } from '@/lib/tune/sliderDefinitions'

const RANGE_CONFIGS = {
  tune: { min: -5, max: 5, step: 1 },
  small: { min: 0, max: 10, step: 0.5 },
  medium: { min: 0, max: 100, step: 1 },
  large: { min: -50, max: 50, step: 5 },
} as const

type RangeKey = keyof typeof RANGE_CONFIGS

function TuneDialShowcase() {
  const [value, setValue] = useState(5.0)
  const [range, setRange] = useState<RangeKey>('small')
  const config = RANGE_CONFIGS[range]

  const handleRangeChange = useCallback((r: string) => {
    const key = r as RangeKey
    const c = RANGE_CONFIGS[key]
    setRange(key)
    setValue((prev) => Math.max(c.min, Math.min(c.max, prev)))
  }, [])

  return (
    <ShowcaseCard
      name="TuneDial"
      controls={
        <>
          <ValueRow label="value" value={value} />
          <ChipRow
            label="range"
            options={['tune', 'small', 'medium', 'large']}
            selected={range}
            onSelect={handleRangeChange}
          />
        </>
      }
    >
      <TuneDial
        value={value}
        previousValue={config.min + (config.max - config.min) * 0.3}
        min={config.min}
        max={config.max}
        step={config.step}
        onValueChange={setValue}
      />
    </ShowcaseCard>
  )
}

function CompactTuneDialShowcase() {
  const [value, setValue] = useState(0.5)

  return (
    <ShowcaseCard name="TuneDial Compact" controls={<ValueRow label="value" value={value} />}>
      <View style={{ width: 180 }}>
        <TuneDial
          value={value}
          previousValue={0.3}
          min={0}
          max={1}
          step={0.01}
          onValueChange={setValue}
        />
      </View>
    </ShowcaseCard>
  )
}

function AlertPercentageTuneDialShowcase() {
  const [threshold, setThreshold] = useState(80)

  return (
    <ShowcaseCard
      name="TuneDial Alert Percentage"
      controls={<ValueRow label="threshold" value={`${threshold}%`} />}
    >
      <TuneDial
        value={threshold}
        previousValue={65}
        min={0}
        max={100}
        step={1}
        onValueChange={setThreshold}
      />
    </ShowcaseCard>
  )
}

function BasicSliderCellShowcase() {
  const triggerRef = useTriggerRef()
  const [value, setValue] = useState(6.5)
  const [editorOpen, setEditorOpen] = useState(false)
  const mockItem: BasicSliderItem = useMemo(
    () => ({
      id: 'mock-angle',
      label: 'Pushback angle',
      value,
      min: 0,
      max: 15,
      step: 0.5,
      source: 'Profile: Street',
      info: 'Sets the tilt angle for pushback notification.',
      modifiedManually: false,
    }),
    [value],
  )
  const editorTarget: FieldEditorTarget | null = editorOpen
    ? {
        triggerRef,
        label: mockItem.label,
        fieldId: mockItem.id,
        value,
        min: mockItem.min,
        max: mockItem.max,
        step: mockItem.step,
        unit: 'deg',
        help: mockItem.info,
      }
    : null

  return (
    <>
      <ShowcaseCard
        name="BasicSliderCell + FieldEditorPopover"
        controls={<ValueRow label="applied value" value={value} />}
      >
        <View style={{ maxWidth: 200 }}>
          <BasicSliderCell
            ref={triggerRef}
            item={mockItem}
            editable
            onPress={() => setEditorOpen(true)}
            onInfo={() => {}}
          />
        </View>
      </ShowcaseCard>
      <FieldEditorPopover
        target={editorTarget}
        onCancel={() => setEditorOpen(false)}
        onApply={(nextValue) => {
          setValue(nextValue)
          setEditorOpen(false)
        }}
      />
    </>
  )
}

export default function TunePage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={ToolboxIcon}
          description="TuneDial, BasicSliderCell, TuneSyncBar, TuneGroupGrid."
        />
        <TuneDialShowcase />
        <CompactTuneDialShowcase />
        <AlertPercentageTuneDialShowcase />
        <BasicSliderCellShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.neutral.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})

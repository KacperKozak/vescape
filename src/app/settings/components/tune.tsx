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
import { TunePreview } from '@/components/ui/tune/TunePreview'
import { RiderBalanceControl } from '@/components/ui/tune/RiderBalanceControl'
import { TunePreviewScenarioControls } from '@/components/ui/tune/TunePreviewScenarioControls'
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
        unit="%"
        onValueChange={setThreshold}
      />
    </ShowcaseCard>
  )
}

function GeigerAlertTuneDialShowcase() {
  const [threshold, setThreshold] = useState(35)
  const [thresholdMax, setThresholdMax] = useState(75)

  return (
    <ShowcaseCard
      name="TuneDial Geiger Alert"
      controls={
        <>
          <ValueRow label="threshold" value={`${threshold}%`} />
          <ValueRow label="max" value={`${thresholdMax}%`} />
        </>
      }
    >
      <TuneDial
        value={threshold}
        previousValue={25}
        min={0}
        max={100}
        step={1}
        unit="%"
        indicatorGlow="right"
        valueChangeMode="commit"
        onValueChange={setThreshold}
      />
      <TuneDial
        value={thresholdMax}
        previousValue={85}
        min={0}
        max={100}
        step={1}
        unit="%"
        indicatorGlow="left"
        valueChangeMode="commit"
        onValueChange={setThresholdMax}
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
        name="BasicSliderCell + automatic-edge tune editor"
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

function TunePreviewShowcase() {
  const [riderLean, setRiderLean] = useState(0.55)
  const [speedKmh, setSpeedKmh] = useState(15)
  const [scenario, setScenario] = useState('acceleration')
  const fields = useMemo(
    () => ({
      kp: 20,
      kp2: 0.6,
      ki: 0.02,
      mahony_kp: 2,
      mahony_kp_roll: 1.4,
      torquetilt_strength: 0.1,
      torquetilt_strength_regen: 0.12,
      torquetilt_start_current: 15,
      torquetilt_angle_limit: 8,
      torquetilt_on_speed: 10,
      torquetilt_off_speed: 8,
      braketilt_strength: 10,
      braketilt_lingering: 2,
      atr_on_speed: 10,
      atr_off_speed: 8,
      tiltback_constant: 1,
      tiltback_constant_erpm: 500,
      tiltback_variable: 0.3,
      tiltback_variable_max: 3,
      tiltback_variable_erpm: 1000,
    }),
    [],
  )

  const selectScenario = (next: string) => {
    setScenario(next)
    if (next === 'acceleration') {
      setRiderLean(0.7)
      setSpeedKmh(15)
    } else if (next === 'braking') {
      setRiderLean(-0.7)
      setSpeedKmh(15)
    } else {
      setRiderLean(0)
      setSpeedKmh(40)
    }
  }

  return (
    <ShowcaseCard
      name="Tune Preview"
      controls={
        <>
          <ChipRow
            label="state"
            options={['acceleration', 'braking', 'high speed']}
            selected={scenario}
            onSelect={selectScenario}
          />
          <ValueRow label="rider balance" value={`${Math.round(riderLean * 100)}%`} />
        </>
      }
    >
      <TunePreview fields={fields} riderLean={riderLean} speedKmh={speedKmh} onHelp={() => {}} />
      <RiderBalanceControl value={riderLean} onValueChange={setRiderLean} />
      <TunePreviewScenarioControls speedKmh={speedKmh} onSpeedChange={setSpeedKmh} />
    </ShowcaseCard>
  )
}

function UnsupportedTunePreviewShowcase() {
  return (
    <ShowcaseCard name="Tune Preview — unsupported">
      <TunePreview
        fields={{ kp: 20 }}
        riderLean={0}
        speedKmh={15}
        active={false}
        onHelp={() => {}}
      />
    </ShowcaseCard>
  )
}

export default function TunePage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={ToolboxIcon}
          description="TuneDial, BasicSliderCell, Tune Preview, TuneSyncBar, TuneGroupGrid."
        />
        <TuneDialShowcase />
        <CompactTuneDialShowcase />
        <AlertPercentageTuneDialShowcase />
        <GeigerAlertTuneDialShowcase />
        <BasicSliderCellShowcase />
        <TunePreviewShowcase />
        <UnsupportedTunePreviewShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})

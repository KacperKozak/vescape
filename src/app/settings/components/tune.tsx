import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useMemo, useState } from 'react'
import { useSharedValue } from 'react-native-reanimated'

import { ToolboxIcon } from 'phosphor-react-native'
import {
  FieldEditorPopover,
  type FieldEditorTarget,
} from '@/components/domain/tune/FieldEditorPopover'
import { useTriggerRef } from '@/components/ui/forms/Dropdown'
import { BasicSliderCell } from '@/components/ui/tune/BasicSliderCell'
import { TuneDial } from '@/components/ui/tune/TuneDial'
import { TunePreview } from '@/components/ui/tune/TunePreview'
import { DeckDisturbanceControl } from '@/components/ui/tune/DeckDisturbanceControl'
import { TunePreviewScenarioControls } from '@/components/ui/tune/TunePreviewScenarioControls'
import { IconHero } from '@/components/ui/settings/IconHero'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { ChipRow, ValueRow } from '@/components/ui/dev/ShowcaseControls'

import { theme } from '@/constants/theme'
import type { BasicSliderItem } from '@/lib/tune/sliderDefinitions'
import { DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS } from '@/lib/tune/tunePreview'

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
  const deckDisturbanceDegrees = useSharedValue(0)
  const deckDisturbanceActive = useSharedValue(false)
  const [speedKmh, setSpeedKmh] = useState(15)
  const [holdSpeed, setHoldSpeed] = useState(false)
  const [scenario, setScenario] = useState('dynamic speed')
  const [hillsEnabled, setHillsEnabled] = useState(false)
  const [hillHeightMeters, setHillHeightMeters] = useState(2.5)
  const [hillSpacingMeters, setHillSpacingMeters] = useState(30)
  const [advancedPhysics, setAdvancedPhysics] = useState(DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS)
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
      atr_strength_up: 1.5,
      atr_strength_down: 1.5,
      atr_threshold_up: 1,
      atr_threshold_down: 1,
      atr_speed_boost: 0.3,
      atr_angle_limit: 8,
      atr_response_boost: 1.5,
      atr_transition_boost: 1.5,
      atr_filter: 5,
      atr_amps_accel_ratio: 8,
      atr_amps_decel_ratio: 8,
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
    if (next === 'dynamic speed') {
      setHillsEnabled(false)
      setSpeedKmh(15)
      setHoldSpeed(false)
    } else if (next === 'high speed') {
      setHillsEnabled(false)
      setSpeedKmh(40)
      setHoldSpeed(true)
    } else if (next === 'hills' || next === 'dense hills') {
      setHillsEnabled(true)
      setSpeedKmh(15)
      setHoldSpeed(true)
      setHillHeightMeters(next === 'dense hills' ? 5 : 2.5)
      setHillSpacingMeters(next === 'dense hills' ? 15 : 30)
    } else {
      setHillsEnabled(false)
      setSpeedKmh(15)
      setHoldSpeed(true)
    }
  }

  return (
    <ShowcaseCard
      name="Tune Preview"
      controls={
        <>
          <ChipRow
            label="state"
            options={['fixed speed', 'dynamic speed', 'high speed', 'hills', 'dense hills']}
            selected={scenario}
            onSelect={selectScenario}
          />
          <ValueRow label="deck disturbance" value="hold and drag" />
        </>
      }
    >
      <TunePreview
        fields={fields}
        deckDisturbanceDegrees={deckDisturbanceDegrees}
        deckDisturbanceActive={deckDisturbanceActive}
        speedKmh={speedKmh}
        holdSpeed={holdSpeed}
        hillsEnabled={hillsEnabled}
        hillHeightMeters={hillHeightMeters}
        hillSpacingMeters={hillSpacingMeters}
        advancedPhysics={advancedPhysics}
        onHelp={() => {}}
      />
      <DeckDisturbanceControl
        angleDegrees={deckDisturbanceDegrees}
        active={deckDisturbanceActive}
      />
      <TunePreviewScenarioControls
        speedKmh={speedKmh}
        onSpeedChange={setSpeedKmh}
        holdSpeed={holdSpeed}
        onHoldSpeedChange={setHoldSpeed}
        advancedPhysics={advancedPhysics}
        onAdvancedPhysicsChange={setAdvancedPhysics}
        hillsEnabled={hillsEnabled}
        onHillsChange={setHillsEnabled}
        hillHeightMeters={hillHeightMeters}
        onHillHeightChange={setHillHeightMeters}
        hillSpacingMeters={hillSpacingMeters}
        onHillSpacingChange={setHillSpacingMeters}
      />
    </ShowcaseCard>
  )
}

function UnsupportedTunePreviewShowcase() {
  const deckDisturbanceDegrees = useSharedValue(0)
  const deckDisturbanceActive = useSharedValue(false)

  return (
    <ShowcaseCard name="Tune Preview — unsupported">
      <TunePreview
        fields={{ kp: 20 }}
        deckDisturbanceDegrees={deckDisturbanceDegrees}
        deckDisturbanceActive={deckDisturbanceActive}
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

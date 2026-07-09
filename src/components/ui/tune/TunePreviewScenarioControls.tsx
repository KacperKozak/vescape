import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { AtomIcon, CaretDownIcon, MountainsIcon } from 'phosphor-react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated'

import { Select, type SelectOption } from '@/components/ui/forms/Select'
import { SelectCard } from '@/components/ui/forms/SelectCard'
import { TuneDial } from '@/components/ui/tune/TuneDial'
import { theme } from '@/constants/theme'
import {
  TUNE_PREVIEW_MOTOR_PRESETS,
  calculateTerrainLoadCurrentAmps,
  resolveTunePreviewPhysics,
  type TunePreviewAdvancedPhysics,
  type TunePreviewMotorPresetId,
} from '@/lib/tune/tunePreview'

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

const MOTOR_OPTIONS: SelectOption<TunePreviewMotorPresetId>[] = Object.entries(
  TUNE_PREVIEW_MOTOR_PRESETS,
).map(([value, preset]) => ({ value: value as TunePreviewMotorPresetId, label: preset.label }))

export type HillsPresetId = 'flat' | 'large' | 'small' | 'pumptrack' | 'custom'

export const HILLS_PRESETS: Record<
  Exclude<HillsPresetId, 'custom'>,
  { label: string; heightMeters: number; spacingMeters: number }
> = {
  flat: { label: 'Flat road', heightMeters: 0, spacingMeters: 0 },
  large: { label: 'Large hills · 8 m · 90 m', heightMeters: 8, spacingMeters: 90 },
  small: { label: 'Small hills · 2 m · 24 m', heightMeters: 2, spacingMeters: 24 },
  pumptrack: { label: 'Pumptrack · 0.5 m · 5 m', heightMeters: 0.5, spacingMeters: 5 },
}

const HILLS_OPTIONS: SelectOption<HillsPresetId>[] = [
  ...Object.entries(HILLS_PRESETS).map(([value, preset]) => ({
    value: value as HillsPresetId,
    label: preset.label,
  })),
  { value: 'custom', label: 'Enter your own' },
]

interface TunePreviewScenarioControlsProps {
  advancedPhysics: TunePreviewAdvancedPhysics
  onAdvancedPhysicsChange: (physics: TunePreviewAdvancedPhysics) => void
  hillsPreset: HillsPresetId
  onHillsPresetChange: (preset: HillsPresetId) => void
  hillHeightMeters: number
  onHillHeightChange: (value: number) => void
  hillSpacingMeters: number
  onHillSpacingChange: (value: number) => void
  hillsEnabled: boolean
  hillLoadAmps: SharedValue<number>
}

export function TunePreviewScenarioControls({
  advancedPhysics,
  onAdvancedPhysicsChange,
  hillsPreset,
  onHillsPresetChange,
  hillHeightMeters,
  onHillHeightChange,
  hillSpacingMeters,
  onHillSpacingChange,
  hillsEnabled,
  hillLoadAmps,
}: TunePreviewScenarioControlsProps) {
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const physics = resolveTunePreviewPhysics(advancedPhysics)
  const tenPercentGradeCurrent = calculateTerrainLoadCurrentAmps(0.1, physics)
  const updatePhysics = (patch: Partial<TunePreviewAdvancedPhysics>) =>
    onAdvancedPhysicsChange({ ...physics, ...patch })

  const handlePresetChange = (preset: HillsPresetId) => {
    onHillsPresetChange(preset)
    if (preset !== 'custom' && preset !== 'flat') {
      const values = HILLS_PRESETS[preset]
      if (values) {
        onHillHeightChange(values.heightMeters)
        onHillSpacingChange(values.spacingMeters)
      }
    }
  }

  return (
    <View style={styles.stack}>
      <SelectCard
        icon={MountainsIcon}
        iconColor={theme.palette.green.color}
        title="Terrain"
        description="Simulates the slope the board rides over"
        options={HILLS_OPTIONS}
        value={hillsPreset}
        onChange={handlePresetChange}
      >
        {hillsPreset === 'custom' ? (
          <>
            <Text style={styles.description}>
              Valley-to-peak height · {hillHeightMeters.toFixed(1)} m
            </Text>
            <TuneDial
              value={hillHeightMeters}
              min={0}
              max={50}
              step={0.1}
              unit="m"
              valueChangeMode="live"
              onValueChange={onHillHeightChange}
            />
            <Text style={styles.description}>
              Peak-to-peak distance · {hillSpacingMeters.toFixed(0)} m
            </Text>
            <TuneDial
              value={hillSpacingMeters}
              min={2}
              max={1000}
              step={1}
              unit="m"
              valueChangeMode="live"
              onValueChange={onHillSpacingChange}
            />
          </>
        ) : null}
      </SelectCard>

      <View style={styles.container}>
        <Pressable
          style={styles.header}
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedExpanded }}
          onPress={() => setAdvancedExpanded((expanded) => !expanded)}
        >
          <View style={styles.titleRow}>
            <AtomIcon size={16} color={theme.palette.purple.color} weight="duotone" />
            <View>
              <Text style={styles.title}>Advanced settings</Text>
              <Text style={styles.description}>Physical model of the board</Text>
            </View>
          </View>
          <CaretDownIcon
            size={16}
            color={theme.palette.slate.textMuted}
            weight="bold"
            style={{ transform: [{ rotate: advancedExpanded ? '180deg' : '0deg' }] }}
          />
        </Pressable>
        {advancedExpanded ? (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            style={styles.physicsControls}
          >
            <Text style={styles.valueSummary}>
              10% grade requires approximately {tenPercentGradeCurrent.toFixed(1)} A
            </Text>
            {hillsEnabled ? <HillLoadReadout value={hillLoadAmps} /> : null}
            <Text style={styles.description}>Motor preset</Text>
            <Select
              options={MOTOR_OPTIONS}
              value={physics.motorPresetId}
              onChange={(motorPresetId) => {
                const preset = TUNE_PREVIEW_MOTOR_PRESETS[motorPresetId]
                updatePhysics({ motorPresetId, motorTorqueNmPerAmp: preset.motorTorqueNmPerAmp })
              }}
            />
            <Text style={styles.description}>
              Rider + Board mass · {physics.totalMassKg.toFixed(0)} kg
            </Text>
            <TuneDial
              value={physics.totalMassKg}
              min={30}
              max={250}
              step={1}
              unit="kg"
              valueChangeMode="live"
              onValueChange={(totalMassKg) => updatePhysics({ totalMassKg })}
            />
            <Text style={styles.description}>
              Motor torque constant · {physics.motorTorqueNmPerAmp.toFixed(2)} Nm/A
            </Text>
            <TuneDial
              value={physics.motorTorqueNmPerAmp}
              min={0.2}
              max={1.5}
              step={0.01}
              unit="Nm/A"
              valueChangeMode="live"
              onValueChange={(motorTorqueNmPerAmp) => updatePhysics({ motorTorqueNmPerAmp })}
            />
            <Text style={styles.description}>
              Motor current limit · {physics.maxMotorCurrentAmps.toFixed(0)} A
            </Text>
            <TuneDial
              value={physics.maxMotorCurrentAmps}
              min={10}
              max={150}
              step={1}
              unit="A"
              valueChangeMode="live"
              onValueChange={(maxMotorCurrentAmps) => updatePhysics({ maxMotorCurrentAmps })}
            />
            <Text style={styles.description}>
              Wheel diameter · {physics.wheelDiameterInches.toFixed(1)} in
            </Text>
            <TuneDial
              value={physics.wheelDiameterInches}
              min={8}
              max={20}
              step={0.1}
              unit="in"
              valueChangeMode="live"
              onValueChange={(wheelDiameterInches) => updatePhysics({ wheelDiameterInches })}
            />
            <Text style={styles.description}>
              Motor poles · {physics.motorPoleCount.toFixed(0)}
            </Text>
            <TuneDial
              value={physics.motorPoleCount}
              min={2}
              max={60}
              step={2}
              valueChangeMode="live"
              onValueChange={(motorPoleCount) => updatePhysics({ motorPoleCount })}
            />
            <Text style={styles.description}>
              Drivetrain efficiency · {(physics.drivetrainEfficiency * 100).toFixed(0)}%
            </Text>
            <TuneDial
              value={physics.drivetrainEfficiency * 100}
              min={50}
              max={100}
              step={1}
              unit="%"
              valueChangeMode="live"
              onValueChange={(efficiencyPercent) =>
                updatePhysics({ drivetrainEfficiency: efficiencyPercent / 100 })
              }
            />
            <Text style={styles.description}>
              Center-of-mass height · {physics.centerOfMassHeightMeters.toFixed(2)} m
            </Text>
            <TuneDial
              value={physics.centerOfMassHeightMeters}
              min={0.4}
              max={1.5}
              step={0.01}
              unit="m"
              valueChangeMode="live"
              onValueChange={(centerOfMassHeightMeters) =>
                updatePhysics({ centerOfMassHeightMeters })
              }
            />
            <Text style={styles.description}>
              Pitch damping · {physics.pitchDampingPerSecond.toFixed(1)} /s
            </Text>
            <TuneDial
              value={physics.pitchDampingPerSecond}
              min={0}
              max={30}
              step={0.5}
              unit="/s"
              valueChangeMode="live"
              onValueChange={(pitchDampingPerSecond) => updatePhysics({ pitchDampingPerSecond })}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 8,
  },
  container: {
    gap: 4,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: theme.palette.slate.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: theme.palette.slate.textPrimary, fontSize: 13, fontWeight: '900' },
  description: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '600' },
  physicsControls: { gap: 4 },
  valueSummary: {
    color: theme.telemetry.motorCurrent,
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
    padding: 0,
    margin: 0,
    fontVariant: ['tabular-nums'],
  },
})

function HillLoadReadout({ value }: { value: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    'worklet'
    const v = value.value
    const text = `Hill load ${v >= 0 ? '+' : ''}${v.toFixed(1)} A`
    return { text, defaultValue: text }
  })
  return (
    <AnimatedTextInput
      editable={false}
      caretHidden
      pointerEvents="none"
      underlineColorAndroid="transparent"
      animatedProps={animatedProps}
      style={[styles.valueSummary]}
    />
  )
}

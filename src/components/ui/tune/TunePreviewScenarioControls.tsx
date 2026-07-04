import { StyleSheet, Switch, Text, View } from 'react-native'
import { AtomIcon, GaugeIcon, MountainsIcon } from 'phosphor-react-native'

import { Select, type SelectOption } from '@/components/ui/forms/Select'
import { TuneDial } from '@/components/ui/tune/TuneDial'
import { theme } from '@/constants/theme'
import {
  DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS,
  TUNE_PREVIEW_MOTOR_PRESETS,
  calculateTerrainLoadCurrentAmps,
  type TunePreviewAdvancedPhysics,
  type TunePreviewMotorPresetId,
} from '@/lib/tune/tunePreview'

const MOTOR_OPTIONS: SelectOption<TunePreviewMotorPresetId>[] = Object.entries(
  TUNE_PREVIEW_MOTOR_PRESETS,
).map(([value, preset]) => ({ value: value as TunePreviewMotorPresetId, label: preset.label }))

interface TunePreviewScenarioControlsProps {
  speedKmh: number
  onSpeedChange: (speedKmh: number) => void
  holdSpeed: boolean
  onHoldSpeedChange: (holdSpeed: boolean) => void
  advancedPhysics: TunePreviewAdvancedPhysics
  onAdvancedPhysicsChange: (physics: TunePreviewAdvancedPhysics) => void
  hillsEnabled: boolean
  onHillsChange: (enabled: boolean) => void
  hillHeightMeters: number
  onHillHeightChange: (value: number) => void
  hillSpacingMeters: number
  onHillSpacingChange: (value: number) => void
}

export function TunePreviewScenarioControls({
  speedKmh,
  onSpeedChange,
  holdSpeed,
  onHoldSpeedChange,
  advancedPhysics,
  onAdvancedPhysicsChange,
  hillsEnabled,
  onHillsChange,
  hillHeightMeters,
  onHillHeightChange,
  hillSpacingMeters,
  onHillSpacingChange,
}: TunePreviewScenarioControlsProps) {
  const motorPresetId =
    advancedPhysics.motorPresetId ?? DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS.motorPresetId
  const totalMassKg = Number.isFinite(advancedPhysics.totalMassKg)
    ? advancedPhysics.totalMassKg
    : DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS.totalMassKg
  const tenPercentGradeCurrent = calculateTerrainLoadCurrentAmps(0.1, {
    ...advancedPhysics,
    enabled: true,
    motorPresetId,
    totalMassKg,
  })

  return (
    <View style={styles.stack}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <GaugeIcon size={16} color={theme.telemetry.speed} weight="duotone" />
            <Text style={styles.title}>Constant speed</Text>
          </View>
          <Switch value={holdSpeed} onValueChange={onHoldSpeedChange} />
        </View>
        <Text style={styles.description}>
          {holdSpeed
            ? 'Constant forward speed · reference 11-inch wheel'
            : 'Tune controller effort changes speed · 0-40 km/h'}
        </Text>
        {holdSpeed ? (
          <TuneDial
            value={speedKmh}
            min={0}
            max={40}
            step={1}
            unit="km/h"
            valueChangeMode="live"
            onValueChange={onSpeedChange}
          />
        ) : null}
      </View>

      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <AtomIcon size={16} color={theme.palette.purple.color} weight="duotone" />
            <Text style={styles.title}>Advanced physics</Text>
          </View>
          <Switch
            value={advancedPhysics.enabled}
            onValueChange={(enabled) => onAdvancedPhysicsChange({ ...advancedPhysics, enabled })}
          />
        </View>
        <Text style={styles.description}>
          Optional mass, wheel and motor estimate for hill-load current
        </Text>
        {advancedPhysics.enabled ? (
          <View style={styles.physicsControls}>
            <Text style={styles.valueSummary}>
              10% grade requires approximately {tenPercentGradeCurrent.toFixed(1)} A
            </Text>
            <Select
              options={MOTOR_OPTIONS}
              value={motorPresetId}
              onChange={(motorPresetId) =>
                onAdvancedPhysicsChange({ ...advancedPhysics, motorPresetId })
              }
            />
            <Text style={styles.description}>Rider + Board mass · {totalMassKg.toFixed(0)} kg</Text>
            <TuneDial
              value={totalMassKg}
              min={30}
              max={250}
              step={1}
              unit="kg"
              valueChangeMode="live"
              onValueChange={(totalMassKg) =>
                onAdvancedPhysicsChange({ ...advancedPhysics, totalMassKg })
              }
            />
            <Text style={styles.description}>11-inch wheel · 85% drivetrain efficiency</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <MountainsIcon size={16} color={theme.palette.green.color} weight="duotone" />
            <Text style={styles.title}>Hills</Text>
          </View>
          <Switch value={hillsEnabled} onValueChange={onHillsChange} />
        </View>
        {hillsEnabled ? (
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
    fontVariant: ['tabular-nums'],
  },
})

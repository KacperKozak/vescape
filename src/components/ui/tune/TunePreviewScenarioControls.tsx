import { StyleSheet, Switch, Text, View } from 'react-native'
import { AtomIcon, GaugeIcon, MountainsIcon } from 'phosphor-react-native'

import { TuneDial } from '@/components/ui/tune/TuneDial'
import { theme } from '@/constants/theme'
import {
  calculateSyntheticAcceleration,
  type TunePreviewReferencePhysics,
} from '@/lib/tune/tunePreview'

interface TunePreviewScenarioControlsProps {
  speedKmh: number
  onSpeedChange: (speedKmh: number) => void
  holdSpeed: boolean
  onHoldSpeedChange: (holdSpeed: boolean) => void
  referencePhysics: TunePreviewReferencePhysics
  onReferencePhysicsChange: (physics: TunePreviewReferencePhysics) => void
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
  referencePhysics,
  onReferencePhysicsChange,
  hillsEnabled,
  onHillsChange,
  hillHeightMeters,
  onHillHeightChange,
  hillSpacingMeters,
  onHillSpacingChange,
}: TunePreviewScenarioControlsProps) {
  const updatePhysics = (patch: Partial<Omit<TunePreviewReferencePhysics, 'enabled'>>) =>
    onReferencePhysicsChange({ ...referencePhysics, ...patch })
  const maxAcceleration = calculateSyntheticAcceleration({
    syntheticLoad: 1,
    referencePhysics,
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
            : 'Synthetic Load changes speed · 0-40 km/h'}
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
            <Text style={styles.title}>Reference physics</Text>
          </View>
          <Switch
            value={referencePhysics.enabled}
            onValueChange={(enabled) => onReferencePhysicsChange({ ...referencePhysics, enabled })}
          />
        </View>
        <Text style={styles.description}>
          Optional current-to-acceleration estimate · dynamic speed only
        </Text>
        {referencePhysics.enabled ? (
          <View style={styles.physicsControls}>
            <Text style={styles.valueSummary}>
              ±60 A gives approximately ±{maxAcceleration.toFixed(2)} km/h/s
            </Text>
            <Text style={styles.description}>
              Rider + Board mass · {referencePhysics.totalMassKg.toFixed(0)} kg
            </Text>
            <TuneDial
              value={referencePhysics.totalMassKg}
              min={20}
              max={250}
              step={1}
              unit="kg"
              valueChangeMode="live"
              onValueChange={(totalMassKg) => updatePhysics({ totalMassKg })}
            />
            <Text style={styles.description}>
              Wheel diameter · {referencePhysics.wheelDiameterInches.toFixed(1)} in
            </Text>
            <TuneDial
              value={referencePhysics.wheelDiameterInches}
              min={8}
              max={20}
              step={0.1}
              unit="in"
              valueChangeMode="live"
              onValueChange={(wheelDiameterInches) => updatePhysics({ wheelDiameterInches })}
            />
            <Text style={styles.description}>
              Motor torque constant · {referencePhysics.motorTorqueNmPerAmp.toFixed(2)} Nm/A
            </Text>
            <TuneDial
              value={referencePhysics.motorTorqueNmPerAmp}
              min={0.01}
              max={2}
              step={0.01}
              unit="Nm/A"
              valueChangeMode="live"
              onValueChange={(motorTorqueNmPerAmp) => updatePhysics({ motorTorqueNmPerAmp })}
            />
            <Text style={styles.description}>
              Drivetrain efficiency · {(referencePhysics.drivetrainEfficiency * 100).toFixed(0)}%
            </Text>
            <TuneDial
              value={referencePhysics.drivetrainEfficiency * 100}
              min={10}
              max={100}
              step={1}
              unit="%"
              valueChangeMode="live"
              onValueChange={(percent) => updatePhysics({ drivetrainEfficiency: percent / 100 })}
            />
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
            <Text style={styles.description}>Height · {hillHeightMeters.toFixed(1)} m</Text>
            <TuneDial
              value={hillHeightMeters}
              min={0}
              max={20}
              step={0.1}
              unit="m"
              valueChangeMode="live"
              onValueChange={onHillHeightChange}
            />
            <Text style={styles.description}>Spacing · {hillSpacingMeters.toFixed(0)} m</Text>
            <TuneDial
              value={hillSpacingMeters}
              min={2}
              max={100}
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

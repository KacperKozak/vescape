import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { CheckCircleIcon, CircleIcon, LightningIcon } from 'phosphor-react-native'
import type { BoardProbeProgressEvent, BoardProbeStep } from 'vesc-ble'

import { theme } from '@/constants/theme'

const STAGES = ['Connecting', 'Service ready', 'Probing transports', 'Telemetry confirmed'] as const

/** Stage index a probe step belongs to, used to render the milestone checklist. */
const STEP_STAGE: Record<BoardProbeStep, number> = {
  ble_connecting: 0,
  ble_connected: 1,
  service_ready: 1,
  probing_direct: 2,
  probing_can: 2,
  // BMS detection happens within the probing stage; it's an optional capability,
  // surfaced as its own indicator rather than a pipeline step.
  bms_detected: 2,
  telemetry_confirmed: 3,
  completed: 4,
  failed: 0,
}

interface Props {
  progress: BoardProbeProgressEvent | null
  /** Latched smart-BMS detection for the current run (the hook remembers the one-shot event). */
  bmsDetected: boolean
  deviceName: string
}

export function BoardProbeProgress({ progress, bmsDetected, deviceName }: Props) {
  const currentStage = progress ? STEP_STAGE[progress.step] : 0
  const elapsedSeconds = progress ? (progress.elapsedMs / 1000).toFixed(1) : '0.0'

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Probing {deviceName}</Text>
      <Text style={styles.elapsed}>{elapsedSeconds}s elapsed</Text>

      <View style={styles.stages}>
        {STAGES.map((label, index) => {
          const done = index < currentStage
          const active = index === currentStage
          return (
            <View key={label} style={styles.stageRow}>
              {done ? (
                <CheckCircleIcon size={20} color={theme.gps.color} weight="fill" />
              ) : active ? (
                <ActivityIndicator size="small" color={theme.wheel.color} />
              ) : (
                <CircleIcon size={20} color={theme.neutral.textMuted} weight="regular" />
              )}
              <Text style={[styles.stageLabel, (done || active) && styles.stageLabelActive]}>
                {label}
              </Text>
            </View>
          )
        })}
      </View>

      {bmsDetected ? (
        <View style={styles.bmsRow}>
          <LightningIcon size={18} color={theme.gps.color} weight="fill" />
          <Text style={styles.bmsText}>Smart-BMS detected</Text>
        </View>
      ) : null}

      {progress?.message ? <Text style={styles.message}>{progress.message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  title: {
    color: theme.neutral.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  elapsed: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  stages: {
    gap: 14,
    alignSelf: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 220,
  },
  stageLabel: {
    color: theme.neutral.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  stageLabelActive: {
    color: theme.neutral.textPrimary,
  },
  bmsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginTop: 16,
  },
  bmsText: {
    color: theme.gps.color,
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
})

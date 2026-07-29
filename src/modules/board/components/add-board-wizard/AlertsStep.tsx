import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/base/Text'
import { BellRingingIcon, type Icon } from 'phosphor-react-native'

import { BoardTopSpeedCard } from '@/modules/alerts/components/BoardTopSpeedCard'
import { MetricAlerts } from '@/modules/alerts/components/MetricAlerts'
import { ALERT_PRESET_METRIC_UNITS } from '@/modules/alerts/constants/metricLabels'
import { useDraftMetricAlerts, type DraftAlertSetup } from '@/modules/alerts/hooks/useMetricAlerts'
import { ALERT_PRESET_METRICS, type AlertPresetMetric } from '@/modules/alerts/lib/alertPresets'
import { theme } from '@/constants/theme'
import {
  WizardNavActions,
  WizardStepLayout,
} from '@/modules/board/components/add-board-wizard/WizardStepLayout'
import { ALERT_METRIC_META } from '@/modules/board/components/add-board-wizard/alertMetricMeta'
import type { UseAddBoardWizard } from '@/modules/board/hooks/useAddBoardWizard'

interface AlertSubstep {
  key: 'board-top-speed' | AlertPresetMetric
  title: string
  icon: Icon
}

const ALERT_SUBSTEPS: AlertSubstep[] = [
  { key: 'board-top-speed', title: 'Board top speed', icon: BellRingingIcon },
  ...ALERT_PRESET_METRICS.map((metric) => ({
    key: metric,
    title: `${ALERT_METRIC_META[metric].name} alerts`,
    icon: ALERT_METRIC_META[metric].icon,
  })),
]

export function AlertsStep({ wizard }: { wizard: UseAddBoardWizard }) {
  const [index, setIndex] = useState(0)
  const substep = ALERT_SUBSTEPS[index]!
  const isFirst = index === 0
  const isLast = index === ALERT_SUBSTEPS.length - 1
  const onBack = () => (isFirst ? wizard.back() : setIndex((current) => current - 1))
  const onNext = () => (isLast ? wizard.next() : setIndex((current) => current + 1))

  return (
    <WizardStepLayout
      title={substep.title}
      icon={substep.icon}
      color={theme.palette.amber.color}
      headerRight={
        <>
          <Text style={styles.counter}>
            {index + 1}/{ALERT_SUBSTEPS.length}
          </Text>
          <SubstepProgress total={ALERT_SUBSTEPS.length} index={index} />
          <Pressable
            style={styles.skip}
            onPress={wizard.next}
            hitSlop={8}
            testID="add-board-skip-alerts"
          >
            <Text style={styles.skipLink}>Skip</Text>
          </Pressable>
        </>
      }
      footer={
        <WizardNavActions
          canContinue
          onBack={onBack}
          onNext={onNext}
          nextLabel={isLast ? 'Done' : 'Next'}
          testIDPrefix="add-board-presets"
        />
      }
    >
      {isFirst ? (
        <>
          <Text style={styles.hint}>
            The fastest you consider yourself capable of riding. Scales the speed gauge and alerts.
          </Text>
          <BoardTopSpeedCard value={wizard.topSpeedKmh} onChange={wizard.setTopSpeedKmh} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Pick how loudly this metric warns you. Adjust it any time from its control on the main
            screen.
          </Text>
          <DraftMetricAlerts wizard={wizard} metric={substep.key as AlertPresetMetric} />
        </>
      )}
    </WizardStepLayout>
  )
}

function DraftMetricAlerts({
  wizard,
  metric,
}: {
  wizard: UseAddBoardWizard
  metric: AlertPresetMetric
}) {
  const { setAlertSetup } = wizard
  const onChange = useCallback(
    (setup: DraftAlertSetup) => setAlertSetup(metric, setup),
    [setAlertSetup, metric],
  )
  const controller = useDraftMetricAlerts(metric, {
    setup: wizard.alertSetup[metric],
    topSpeedKmh: wizard.topSpeedKmh,
    hasBatteryConfig: wizard.hasBatteryConfig,
    onChange,
  })

  return <MetricAlerts controller={controller} unit={ALERT_PRESET_METRIC_UNITS[metric]} />
}

function SubstepProgress({ total, index }: { total: number; index: number }) {
  return (
    <View style={styles.bar}>
      {Array.from({ length: total }, (_, segmentIndex) => (
        <View
          key={segmentIndex}
          style={[styles.segment, segmentIndex <= index && styles.segmentActive]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  counter: {
    flex: 1,
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  skip: {
    flex: 1,
    alignItems: 'flex-end',
  },
  skipLink: {
    color: theme.palette.cyan.text,
    fontSize: 13,
    fontWeight: '700',
  },
  bar: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    width: 12,
    height: 2,
    backgroundColor: theme.palette.slate.border,
  },
  segmentActive: {
    backgroundColor: theme.palette.amber.color,
  },
  hint: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
})

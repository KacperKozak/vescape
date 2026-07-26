import { useNavigation } from 'expo-router'
import { BellRingingIcon } from 'phosphor-react-native'
import { type ReactNode, useEffect } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { type SharedValue } from 'react-native-reanimated'
import { Text } from '@/components/base/Text'

import { MetricAlerts } from '@/modules/alerts/components/MetricAlerts'
import { asAlertPresetMetric } from '@/modules/alerts/lib/alertPresets'
import { useBoardMetricAlerts } from '@/modules/alerts/hooks/useMetricAlerts'
import { theme } from '@/constants/theme'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import {
  getHistoryMetricHotRange,
  getHistoryMetricKeyForControlId,
} from '@/modules/history/lib/metricColorScale'

interface Props {
  title: string
  children: ReactNode
  controlId?: string
  unit?: string
  /**
   * Live telemetry for the alert gauge. Preset metrics render their gauge inside the alerts block
   * (markers and levels are the same thing), so the value goes here rather than into `gauge`.
   */
  liveValue?: SharedValue<number | null>
  /** Gauge for controls without Alert Presets, rendered above the alerts block. */
  gauge?: ReactNode
}

/**
 * Shared chrome for a `/control/<metric>` detail screen: title, gauge, the control's alert setup,
 * and the screen's own charts. Every control gets the same alerts block — {@link MetricAlerts}
 * decides whether that means preset levels, the rider's own rules, or the no-board notice.
 */
export function ControlDetailLayout({
  title,
  children,
  controlId,
  unit = '',
  liveValue,
  gauge,
}: Props) {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ title })
  }, [title, navigation])

  const presetMetric = asAlertPresetMetric(controlId)
  const alerts = controlId ? (
    <View style={styles.alertsSection}>
      <View style={styles.sectionHeader}>
        <BellRingingIcon size={20} color={theme.palette.yellow.color} weight="duotone" />
        <Text style={styles.sectionLabel}>Alerts</Text>
      </View>
      <ControlAlerts controlId={controlId} unit={unit} liveValue={liveValue} />
    </View>
  ) : null

  // Preset metrics own a gauge inside their alerts block, so that block leads the screen.
  const alertsFirst = presetMetric != null || gauge != null

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {alertsFirst ? (
        <>
          {gauge}
          {alerts}
          {children}
        </>
      ) : (
        <>
          {children}
          {alerts}
        </>
      )}
    </ScrollView>
  )
}

/** Binds one control's alerts to the active Board and to the history gradient of its metric. */
function ControlAlerts({
  controlId,
  unit,
  liveValue,
}: {
  controlId: string
  unit: string
  liveValue?: SharedValue<number | null>
}) {
  const controller = useBoardMetricAlerts(controlId)
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)

  if (controlId === 'state') {
    return <Text style={styles.stateNote}>Fault alerts are always active.</Text>
  }

  const hotMetric = getHistoryMetricKeyForControlId(controlId)
  const hotRange = hotMetric
    ? getHistoryMetricHotRange(hotMetric, hotRanges, gradientsEnabled)
    : null

  return (
    <MetricAlerts controller={controller} unit={unit} liveValue={liveValue} hotRange={hotRange} />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  alertsSection: {
    gap: 10,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  sectionLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  stateNote: {
    color: theme.palette.slate.textDim,
    fontSize: 14,
  },
})

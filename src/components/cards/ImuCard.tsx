import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

export function ImuCard() {
  const pitchCfg = telemetry.pitch
  const rollCfg = telemetry.roll
  const balanceCfg = telemetry.balancePitch
  const pitchSeries = useLiveMetric(liveSelectors.pitch)
  const rollSeries = useLiveMetric(liveSelectors.roll)
  const balanceSeries = useLiveMetric(liveSelectors.balancePitch)
  const windowMs = useLiveWindowMs()
  const latestPitch = pitchSeries.at(-1)
  const latestRoll = rollSeries.at(-1)
  const latestBalance = balanceSeries.at(-1)

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>IMU</Text>
      <View style={styles.row}>
        <ImuColumn
          label="P"
          value={latestPitch?.value ?? null}
          metric={pitchCfg}
          series={pitchSeries}
          windowMs={windowMs}
        />
        <View style={styles.divider} />
        <ImuColumn
          label="R"
          value={latestRoll?.value ?? null}
          metric={rollCfg}
          series={rollSeries}
          windowMs={windowMs}
        />
        <View style={styles.divider} />
        <ImuColumn
          label="B"
          value={latestBalance?.value ?? null}
          metric={balanceCfg}
          series={balanceSeries}
          windowMs={windowMs}
        />
      </View>
    </View>
  )
}

function ImuColumn({
  label,
  value,
  metric,
  series,
  windowMs,
}: {
  label: string
  value: number | null
  metric: typeof telemetry.pitch
  series: SparklinePoint[]
  windowMs?: number
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value == null ? DASH : metric.format(value)}
        </Text>
        {value != null && metric.unit ? <Text style={styles.unit}>{metric.unit}</Text> : null}
      </View>
      <Sparkline
        points={series}
        color={metric.color}
        height={18}
        minSpan={20}
        fmtMax={metric.formatWithUnit}
        showMaxBadge={false}
        windowMs={windowMs}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    margin: 4,
    gap: 8,
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  divider: {
    width: 1,
    backgroundColor: '#334155',
  },
  column: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '500',
  },
  value: {
    color: '#f1f5f9',
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  unit: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
})

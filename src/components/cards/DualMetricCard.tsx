import { StyleSheet, Text, View } from 'react-native'

import { AlertBadge } from '@/components/TelemetryCard'
import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import type { TelemetryMetricConfig } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'

interface DualMetricCardProps {
  title: string
  left: MetricColumnProps
  right: MetricColumnProps
}

interface MetricColumnProps {
  metric: TelemetryMetricConfig
  label?: string
  value: number | null
  series: SparklinePoint[]
  windowMs?: number
  formatValue?: (value: number) => string
}

export function DualMetricCard({ title, left, right }: DualMetricCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{title}</Text>
      <View style={styles.row}>
        <MetricColumn {...left} />
        <View style={styles.divider} />
        <MetricColumn {...right} />
      </View>
    </View>
  )
}

function MetricColumn({
  metric,
  label,
  value,
  series,
  windowMs,
  formatValue = metric.formatWithUnit,
}: MetricColumnProps) {
  return (
    <View style={styles.column}>
      {metric.controlId ? (
        <View style={styles.alertBadgeContainer}>
          <AlertBadge controlId={metric.controlId} />
        </View>
      ) : null}
      <Text style={styles.label}>{label ?? metric.label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value == null ? DASH : metric.format(value)}
        </Text>
        {value != null && metric.unit ? <Text style={styles.unit}> {metric.unit}</Text> : null}
      </View>
      <Sparkline
        points={series}
        color={metric.color}
        height={18}
        minSpan={metric.minSpan}
        windowMs={windowMs}
        fmtMax={formatValue}
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
    gap: 10,
  },
  divider: {
    width: 1,
    backgroundColor: '#334155',
  },
  column: {
    flex: 1,
    gap: 4,
  },
  alertBadgeContainer: {
    position: 'absolute',
    top: -2,
    right: 0,
    zIndex: 1,
  },
  label: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '500',
    paddingRight: 18,
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

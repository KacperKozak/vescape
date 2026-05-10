import { StyleSheet, Text, View } from 'react-native'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { theme } from '@/constants/theme'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

export function FootpadCard() {
  const adc1Series = useLiveMetric(liveSelectors.footpadAdc1)
  const adc2Series = useLiveMetric(liveSelectors.footpadAdc2)
  const windowMs = useLiveWindowMs()
  const latestAdc1 = adc1Series.at(-1)
  const latestAdc2 = adc2Series.at(-1)

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Footpad</Text>
      <View style={styles.row}>
        <AdcColumn
          label="ADC 1"
          value={latestAdc1 ? latestAdc1.value.toFixed(2) : DASH}
          series={adc1Series}
          color={theme.wheel.color}
          windowMs={windowMs}
        />
        <View style={styles.divider} />
        <AdcColumn
          label="ADC 2"
          value={latestAdc2 ? latestAdc2.value.toFixed(2) : DASH}
          series={adc2Series}
          color={theme.bran.color}
          windowMs={windowMs}
        />
      </View>
    </View>
  )
}

function AdcColumn({
  label,
  value,
  series,
  color,
  windowMs,
}: {
  label: string
  value: string
  series: SparklinePoint[]
  color: string
  windowMs?: number
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Sparkline points={series} color={color} height={18} minSpan={0.5} windowMs={windowMs} />
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
})

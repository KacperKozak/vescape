import { StyleSheet, Text, View } from 'react-native'
import { theme } from '@/constants/theme'

interface Props {
  current: string
  min: string
  max: string
  avg: string
}

export function StatsRow({ current, min, max, avg }: Props) {
  return (
    <View style={styles.row}>
      <StatCell label="CURRENT" value={current} />
      <StatCell label="MIN" value={min} />
      <StatCell label="MAX" value={max} />
      <StatCell label="AVG" value={avg} />
    </View>
  )
}

interface StatCellProps {
  label: string
  value: string
}

function StatCell({ label, value }: StatCellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    flex: 1,
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  label: {
    color: theme.neutral.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  value: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
})

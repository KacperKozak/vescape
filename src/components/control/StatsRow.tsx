import { StyleSheet, Text, View } from 'react-native'

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
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
})

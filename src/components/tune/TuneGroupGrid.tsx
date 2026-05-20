import { StyleSheet, Text, View } from 'react-native'

interface TuneGroupGridProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

export function TuneGroupGrid({ title, subtitle, children }: TuneGroupGridProps) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupCount}>{subtitle}</Text>
      </View>
      <View style={styles.grid}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: 6,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  groupTitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})

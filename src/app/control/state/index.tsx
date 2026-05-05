import { StyleSheet, Text, View } from 'react-native'

import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { useBleStore } from '@/store/bleStore'

export default function StateScreen() {
  const latest = useBleStore((s) => s.recentTelemetry.at(-1))

  return (
    <ControlDetailLayout title="State">
      <View style={styles.card}>
        <Text style={styles.label}>BOARD STATE</Text>
        <Text style={styles.stateName}>{latest?.stateName ?? '—'}</Text>
      </View>

      {latest?.hasFault ? (
        <View style={[styles.card, styles.faultCard]}>
          <Text style={styles.faultLabel}>FAULT CODE</Text>
          <Text style={styles.faultCode}>{latest.faultCode}</Text>
        </View>
      ) : null}
    </ControlDetailLayout>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stateName: {
    color: '#f1f5f9',
    fontSize: 28,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  faultCard: {
    borderWidth: 1,
    borderColor: '#991b1b',
    backgroundColor: '#1c0a0a',
  },
  faultLabel: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  faultCode: {
    color: '#fca5a5',
    fontSize: 28,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
})

import { StyleSheet, Text, View } from 'react-native'

import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { useBleStore } from '@/store/bleStore'
import { theme } from '@/constants/theme'

export default function StateScreen() {
  const hasLiveTelemetry = useBleStore((s) => s.liveStatus.boardLastPacketAt != null)

  return (
    <ControlDetailLayout title="State" controlId="state">
      <View style={styles.card}>
        <Text style={styles.label}>BOARD STATE</Text>
        <Text style={styles.stateName}>{hasLiveTelemetry ? 'LIVE' : '—'}</Text>
      </View>
    </ControlDetailLayout>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  label: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stateName: {
    color: theme.neutral.textPrimary,
    fontSize: 28,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
})

import { ActivityIndicator, StyleSheet, View } from 'react-native'
import type { SyncStatus } from 'vescape-core'

import { Text } from '@/components/base/Text'
import { backupStatusCopy } from '@/modules/profile/lib/backupStatus'
import { useSyncStatusStore } from '@/modules/profile/store/syncStatusStore'

interface BackupStatusLineProps {
  /** Render a given status instead of the live one — the component showcase and previews. */
  status?: SyncStatus
}

/**
 * The backup state, as one line under the account identity. Native owns the state and the pause
 * reason; this only renders them.
 */
export function BackupStatusLine({ status }: BackupStatusLineProps) {
  const liveStatus = useSyncStatusStore((state) => state.status)
  const copy = backupStatusCopy(status ?? liveStatus)

  return (
    <View style={styles.row}>
      {copy.busy ? (
        <ActivityIndicator size="small" color={copy.color} />
      ) : (
        <View style={[styles.dot, { backgroundColor: copy.color }]} />
      )}
      <Text numberOfLines={1} style={[styles.label, { color: copy.color }]}>
        {copy.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
})

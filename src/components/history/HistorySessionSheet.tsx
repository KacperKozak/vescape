import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CaretRightIcon, WarningCircleIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fmtSpeed } from '@/helpers/format'
import type { HistorySession } from '@/store/historyStore'

interface HistorySessionSheetProps {
  visible: boolean
  sessions: HistorySession[]
  selectedSessionId: string | null
  onClose: () => void
  onSelectSession: (session: HistorySession) => void
}

export function HistorySessionSheet({
  visible,
  sessions,
  selectedSessionId,
  onClose,
  onSelectSession,
}: HistorySessionSheetProps) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Rides</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>No sessions</Text>
          ) : (
            sessions.map((session) => {
              const selected = session.id === selectedSessionId
              return (
                <Pressable
                  key={session.id}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => onSelectSession(session)}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowDate}>
                      {new Date(session.startAtMs).toLocaleString()}
                    </Text>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {session.deviceName}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatDuration(session.endAtMs - session.startAtMs)} ·{' '}
                      {formatDistance(session.distanceM)} · {fmtSpeed(session.maxSpeedKmh)} km/h ·
                      GPS {session.gpsPointCount}
                    </Text>
                    {session.faultCount > 0 && (
                      <View style={styles.faultRow}>
                        <WarningCircleIcon size={12} color="#fca5a5" weight="fill" />
                        <Text style={styles.faultText}>{session.faultCount} faults</Text>
                      </View>
                    )}
                  </View>
                  <CaretRightIcon size={16} color="#64748b" weight="bold" />
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

function formatDistance(distanceM: number | null): string {
  if (distanceM == null) return '-'
  return `${(distanceM / 1000).toFixed(2)} km`
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#131c2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '82%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  scroll: {
    maxHeight: '100%',
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 8,
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 20,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowSelected: {
    borderColor: '#3b82f6',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowDate: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  rowName: {
    color: '#94a3b8',
    fontSize: 12,
  },
  rowMeta: {
    color: '#64748b',
    fontSize: 11,
  },
  faultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  faultText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
  },
})

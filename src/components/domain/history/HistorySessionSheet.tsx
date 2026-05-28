import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { CaretRightIcon, WarningCircleIcon } from 'phosphor-react-native'

import { interaction, theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'
import type { HistorySession } from '@/store/historyStore'

interface HistorySessionSheetProps {
  visible: boolean
  bottomOffset: number
  sessions: HistorySession[]
  selectedSessionId: string | null
  hasMore: boolean
  loadingMore: boolean
  onClose: () => void
  onSelectSession: (session: HistorySession) => void
  onLoadMore: () => void
}

export function HistorySessionSheet({
  visible,
  bottomOffset,
  sessions,
  selectedSessionId,
  hasMore,
  loadingMore,
  onClose,
  onSelectSession,
  onLoadMore,
}: HistorySessionSheetProps) {
  if (!visible) return null

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMore || loadingMore) return
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height)
    if (distanceFromEnd < 80) onLoadMore()
  }

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.panel, { bottom: bottomOffset }]}>
        <Text style={styles.title}>Rides</Text>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          scrollEventThrottle={120}
          onScroll={handleScroll}
        >
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>No sessions</Text>
          ) : (
            sessions.map((session) => {
              const selected = session.id === selectedSessionId
              return (
                <Pressable
                  key={session.id}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
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
                      {formatDistance(session.distanceM)} ·{' '}
                      {telemetry.speed.formatWithUnit(session.maxSpeedKmh)} · GPS{' '}
                      {session.gpsPointCount}
                    </Text>
                    {session.faultCount > 0 && (
                      <View style={styles.faultRow}>
                        <WarningCircleIcon size={12} color={theme.error.color} weight="fill" />
                        <Text style={styles.faultText}>{session.faultCount} faults</Text>
                      </View>
                    )}
                  </View>
                  <CaretRightIcon size={16} color={theme.neutral.textDim} weight="bold" />
                </Pressable>
              )
            })
          )}
          {hasMore && (
            <Pressable
              style={({ pressed }) => [styles.loadingRow, pressed && styles.loadingPressed]}
              disabled={loadingMore}
              onPress={onLoadMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={theme.wheel.color} />
              ) : (
                <Text style={styles.loadingText}>Load older rides</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </View>
    </>
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
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 24,
  },
  panel: {
    position: 'absolute',
    left: '50%',
    zIndex: 25,
    width: 280,
    maxHeight: 360,
    transform: [{ translateX: -140 }],
    backgroundColor: theme.neutral.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  title: {
    color: theme.neutral.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  scroll: {
    maxHeight: '100%',
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  emptyText: {
    color: theme.neutral.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowSelected: {
    borderColor: theme.wheel.color,
  },
  rowPressed: {
    backgroundColor: interaction.pressedBg,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowDate: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  rowName: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
  },
  rowMeta: {
    color: theme.neutral.textMuted,
    fontSize: 11,
  },
  faultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  faultText: {
    color: theme.error.color,
    fontSize: 11,
    fontWeight: '700',
  },
  loadingRow: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
  },
  loadingPressed: {
    backgroundColor: interaction.pressedBg,
  },
  loadingText: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
})

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { useNavigation } from 'expo-router'
import { TrashIcon } from 'phosphor-react-native'
import { clearDiagnosticEvents, getDiagnosticEvents, type LocalDiagnosticEvent } from 'vesc-ble'

import { ConfirmModal } from '@/components/ConfirmModal'
import { IconButton } from '@/components/IconButton'
import { theme } from '@/constants/theme'

const PAGE_SIZE = 50

const GOOD_EVENTS = new Set(['board_ready', 'gatt_connected', 'gatt_ready', 'reconnect_scan_found'])

const BAD_EVENTS = new Set([
  'ble_connect_failed',
  'ble_disconnected_unexpectedly',
  'config_decode_failed',
  'profile_push_failed',
  'board_ready_timeout',
  'reconnect_scan_failed',
  'reconnect_scan_start_failed',
  'reconnect_scan_timeout',
  'connect_phase_timeout',
  'telemetry_parse_failed',
  'telemetry_stale',
  'telemetry_unavailable',
])

function getEventColor(eventName: string): string {
  if (GOOD_EVENTS.has(eventName)) return '#22c55e'
  if (BAD_EVENTS.has(eventName)) return '#ef4444'
  return '#eab308'
}

function formatProperties(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

interface EventItemProps {
  event: LocalDiagnosticEvent
  expanded: boolean
  onToggle: (id: number) => void
}

function EventItem({ event, expanded, onToggle }: EventItemProps) {
  const time = new Date(event.occurredAtMs).toLocaleTimeString()
  const meta = [event.operation, event.phase, event.deviceName].filter(Boolean).join(' · ')
  const dotColor = getEventColor(event.eventName)

  return (
    <Pressable style={styles.eventRow} onPress={() => onToggle(event.id)}>
      <View style={styles.eventHeader}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.eventTime}>{time}</Text>
        <Text style={styles.eventName} numberOfLines={expanded ? undefined : 1}>
          {event.eventName}
        </Text>
      </View>
      {meta ? <Text style={styles.eventMeta}>{meta}</Text> : null}
      {event.message ? (
        <Text style={styles.eventMessage} numberOfLines={expanded ? undefined : 1}>
          {event.message}
        </Text>
      ) : null}
      {expanded ? (
        <View style={styles.eventExpanded}>
          <Text style={styles.fieldLabel}>timestamp</Text>
          <Text style={styles.fieldValue} selectable>
            {new Date(event.occurredAtMs).toLocaleString()}
          </Text>
          {event.deviceId ? (
            <>
              <Text style={[styles.fieldLabel, styles.fieldGap]}>deviceId</Text>
              <Text style={styles.fieldValue} selectable>
                {event.deviceId}
              </Text>
            </>
          ) : null}
          <Text style={[styles.fieldLabel, styles.fieldGap]}>properties</Text>
          <Text style={styles.eventJson} selectable>
            {formatProperties(event.propertiesJson)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export default function DiagnosticEventsScreen() {
  const navigation = useNavigation()
  const [events, setEvents] = useState<LocalDiagnosticEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const loadingRef = useRef(false)

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon={TrashIcon}
          destructive
          disabled={events.length === 0}
          loading={clearing}
          onPress={() => setClearConfirmVisible(true)}
          style={styles.headerAction}
        />
      ),
    })
  }, [clearing, events.length, navigation])

  const loadPage = useCallback(async (cursor?: number) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const page = await getDiagnosticEvents({
        toMs: cursor,
        limit: PAGE_SIZE,
      })
      if (page.length < PAGE_SIZE) setHasMore(false)
      setEvents((prev) => (cursor === undefined ? page : [...prev, ...page]))
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [])

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current || events.length === 0) return
    const oldest = events[events.length - 1]
    void loadPage(oldest.occurredAtMs - 1)
  }, [hasMore, events, loadPage])

  const refresh = useCallback(() => {
    setHasMore(true)
    setExpandedId(null)
    void loadPage(undefined)
  }, [loadPage])

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const clearEvents = useCallback(async () => {
    setClearConfirmVisible(false)
    setClearing(true)
    try {
      await clearDiagnosticEvents()
      setEvents([])
      setExpandedId(null)
      setHasMore(false)
    } finally {
      setClearing(false)
    }
  }, [])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LocalDiagnosticEvent>) => (
      <EventItem event={item} expanded={expandedId === item.id} onToggle={toggleExpand} />
    ),
    [expandedId, toggleExpand],
  )

  const keyExtractor = useCallback((item: LocalDiagnosticEvent) => String(item.id), [])

  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={events}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onRefresh={refresh}
        refreshing={loading && events.length === 0}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No local diagnostic events</Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && events.length > 0 ? (
            <ActivityIndicator color="#64748b" style={styles.footer} />
          ) : !hasMore && events.length > 0 ? (
            <Text style={styles.footerText}>— end —</Text>
          ) : null
        }
      />
      <ConfirmModal
        visible={clearConfirmVisible}
        title="Clear event log"
        message="Delete all local diagnostic events?"
        confirmLabel="Clear"
        destructive
        onConfirm={() => void clearEvents()}
        onCancel={() => setClearConfirmVisible(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  headerAction: {
    marginRight: 4,
  },
  list: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 12,
  },
  separator: {
    height: 4,
  },
  emptyCard: {
    backgroundColor: theme.neutral.surfaceDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    padding: 14,
  },
  emptyText: {
    color: theme.neutral.textMuted,
    fontSize: 14,
  },
  footer: {
    paddingVertical: 16,
  },
  footerText: {
    color: theme.neutral.border,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  eventRow: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    padding: 10,
    gap: 2,
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  eventTime: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  eventName: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  eventMeta: {
    color: theme.neutral.textMuted,
    fontSize: 11,
  },
  eventMessage: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
  },
  eventExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.neutral.border,
    gap: 2,
  },
  fieldLabel: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fieldGap: {
    marginTop: 6,
  },
  fieldValue: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  eventJson: {
    color: theme.neutral.textPrimary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
})

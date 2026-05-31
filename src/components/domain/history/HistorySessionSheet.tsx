import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { CaretRightIcon, WarningCircleIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Polyline } from 'react-native-svg'

import { interaction, theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'
import type { HistorySession, TelemetryMinuteBucket } from '@/store/historyStore'

interface HistorySessionSheetProps {
  visible: boolean
  bottomOffset: number
  blocks: TelemetryMinuteBucket[]
  sessions: HistorySession[]
  selectedSessionId: string | null
  hasMore: boolean
  loadingMore: boolean
  onClose: () => void
  onSelectSession: (session: HistorySession) => void
  onLoadMore: () => void
}

const CONTENT_PADDING_VERTICAL = 12
const ROUTE_ROW_HEIGHT = 72
const ROUTE_ROW_PITCH = ROUTE_ROW_HEIGHT + 8
const MAX_PANEL_HEIGHT = 480
const TOP_CLEARANCE = 72

export function HistorySessionSheet({
  visible,
  bottomOffset,
  blocks,
  sessions,
  selectedSessionId,
  hasMore,
  loadingMore,
  onClose,
  onSelectSession,
  onLoadMore,
}: HistorySessionSheetProps) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const scrollRef = useRef<ScrollView>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const selectedIndex = useMemo(
    () => sessions.findIndex((session) => session.id === selectedSessionId),
    [sessions, selectedSessionId],
  )

  useEffect(() => {
    if (!visible || selectedIndex < 0 || viewportHeight <= 0) return
    const frame = requestAnimationFrame(() => {
      const rowCenterY =
        CONTENT_PADDING_VERTICAL + selectedIndex * ROUTE_ROW_PITCH + ROUTE_ROW_HEIGHT / 2
      scrollRef.current?.scrollTo({
        y: Math.max(0, rowCenterY - viewportHeight / 2),
        animated: false,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedIndex, viewportHeight, visible])

  if (!visible) return null

  const availableHeight = windowHeight - bottomOffset - Math.max(insets.top, 8) - TOP_CLEARANCE
  const panelMaxHeight = Math.max(0, Math.min(MAX_PANEL_HEIGHT, availableHeight))

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMore || loadingMore) return
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height)
    if (distanceFromEnd < 80) onLoadMore()
  }

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.panel, { bottom: bottomOffset, maxHeight: panelMaxHeight }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          scrollEventThrottle={120}
          onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          onScroll={handleScroll}
        >
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>No sessions</Text>
          ) : (
            sessions.map((session) => {
              const selected = session.id === selectedSessionId
              const routePoints = getSessionRoutePreviewPoints(blocks, session)
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
                  <RoutePreview points={routePoints} selected={selected} />
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

interface RoutePoint {
  latitude: number
  longitude: number
}

function getSessionRoutePreviewPoints(
  blocks: TelemetryMinuteBucket[],
  session: HistorySession,
): RoutePoint[] {
  const blockIds = new Set(session.blockIds)
  return blocks
    .filter(
      (block) =>
        blockIds.has(block.id) && block.firstLatitude != null && block.firstLongitude != null,
    )
    .sort((a, b) => a.startAtMs - b.startAtMs)
    .map((block) => ({
      latitude: block.firstLatitude!,
      longitude: block.firstLongitude!,
    }))
}

function RoutePreview({ points, selected }: { points: RoutePoint[]; selected: boolean }) {
  const path = formatPreviewPath(points)
  const start = points.length > 0 ? formatPreviewPoint(points, 0) : null
  const end = points.length > 1 ? formatPreviewPoint(points, points.length - 1) : null
  const strokeColor = selected ? theme.wheel.color : theme.target.color

  return (
    <View style={styles.routePreview}>
      {path ? (
        <Svg width="100%" height="100%" viewBox="0 0 74 52">
          <Polyline
            points={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {start && <Circle cx={start.x} cy={start.y} r={3} fill={theme.gps.color} />}
          {end && <Circle cx={end.x} cy={end.y} r={3} fill={theme.error.color} />}
        </Svg>
      ) : (
        <View style={styles.routeEmpty}>
          <View style={styles.routeEmptyLine} />
        </View>
      )}
    </View>
  )
}

function formatPreviewPath(points: RoutePoint[]): string | null {
  if (points.length < 2) return null
  return points
    .map((_, index) => formatPreviewPoint(points, index))
    .map(({ x, y }) => `${x},${y}`)
    .join(' ')
}

function formatPreviewPoint(points: RoutePoint[], index: number): { x: number; y: number } {
  const width = 74
  const height = 52
  const padding = 8
  const minLatitude = Math.min(...points.map((point) => point.latitude))
  const maxLatitude = Math.max(...points.map((point) => point.latitude))
  const minLongitude = Math.min(...points.map((point) => point.longitude))
  const maxLongitude = Math.max(...points.map((point) => point.longitude))
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.00001)
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.00001)
  const point = points[index]
  const x = padding + ((point.longitude - minLongitude) / longitudeSpan) * (width - padding * 2)
  const y = padding + ((maxLatitude - point.latitude) / latitudeSpan) * (height - padding * 2)
  return { x, y }
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
    left: 16,
    right: 16,
    zIndex: 25,
    backgroundColor: theme.neutral.surfaceDeep,
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
  scroll: {
    maxHeight: '100%',
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    gap: 10,
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
  routePreview: {
    width: 74,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeEmptyLine: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.neutral.border,
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

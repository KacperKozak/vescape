import { Lightning, NavigationArrow } from 'phosphor-react-native'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBleStore } from '@/store/bleStore'
import { minuteBucketStart } from '@/store/liveMonitor'
import { theme } from '@/constants/theme'

type BucketSlot = { bucketStartMs: number; points: number; boardCount: number; gpsCount: number }
type GpsFix = { timestamp: number; precise: boolean; accuracyM?: number | null }

function buildBucketSlots(
  liveBuckets: { bucketStartMs: number; boardCount: number; gpsCount: number }[],
  nowMs: number,
): { slots: BucketSlot[]; currentBucketStart: number } {
  const currentBucketStart = minuteBucketStart(nowMs)
  const bucketsByStart = new Map(liveBuckets.map((b) => [b.bucketStartMs, b]))
  const slots = Array.from({ length: 10 }, (_, i) => {
    const bucketStartMs = currentBucketStart - (9 - i) * 60_000
    const bucket = bucketsByStart.get(bucketStartMs)
    const boardCount = bucket?.boardCount ?? 0
    const gpsCount = bucket?.gpsCount ?? 0
    return { bucketStartMs, boardCount, gpsCount, points: boardCount + gpsCount }
  })
  return { slots, currentBucketStart }
}

function bleLabel(status: string, avgLatency: number | null, isStale: boolean): string {
  if (status === 'connected') {
    if (isStale) return 'stale'
    return avgLatency != null ? `${avgLatency}ms` : 'connected'
  }
  if (status === 'scanning') return 'scanning'
  if (status === 'connecting') return 'connecting'
  if (status === 'error') return 'error'
  return 'idle'
}

function bleColor(status: string, isStale: boolean): string {
  if (status === 'connected') return isStale ? theme.error.color : theme.gps.color
  if (status === 'scanning' || status === 'connecting') return theme.wheel.text
  if (status === 'error') return theme.error.color
  return '#475569'
}

function gpsLabel(gpsFix: GpsFix | null, ageSec: number | null): string {
  if (!gpsFix) return 'no GPS'
  if (!gpsFix.precise) return gpsFix.accuracyM != null ? `±${gpsFix.accuracyM.toFixed(0)}m` : 'weak'
  if (ageSec != null && ageSec > 5) return `${ageSec.toFixed(0)}s old`
  return gpsFix.accuracyM != null ? `±${gpsFix.accuracyM.toFixed(0)}m` : 'GPS'
}

function gpsColor(gpsFix: GpsFix | null, ageSec: number | null): string {
  if (!gpsFix) return '#475569'
  if (!gpsFix.precise) return theme.error.color
  if (ageSec != null && ageSec > 5) return theme.warning.color
  return theme.gps.color
}

export function LiveStatusBar() {
  const { liveDataBuckets, status, lastPacketAt, avgLatency, gpsFix } = useBleStore(
    useShallow((s) => ({
      liveDataBuckets: s.liveDataBuckets,
      status: s.status,
      lastPacketAt: s.lastPacketAt,
      avgLatency: s.avgLatency,
      gpsFix: s.gpsFix,
    })),
  )
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(interval)
  }, [])

  const isStale = lastPacketAt != null && nowMs - lastPacketAt > 2000
  const gpsAgeSec = gpsFix ? (nowMs - gpsFix.timestamp) / 1000 : null

  const boardTotal = liveDataBuckets.reduce((total, b) => total + b.boardCount, 0)
  const gpsTotal = liveDataBuckets.reduce((total, b) => total + b.gpsCount, 0)
  const { slots, currentBucketStart } = buildBucketSlots(liveDataBuckets, nowMs)
  const maxBoard = Math.max(1, ...slots.map((s) => s.boardCount))
  const maxGps = Math.max(1, ...slots.map((s) => s.gpsCount))

  const boardColor = bleColor(status, isStale)
  const boardText = bleLabel(status, avgLatency, isStale)
  const gpsText = gpsLabel(gpsFix, gpsAgeSec)
  const gpsClr = gpsColor(gpsFix, gpsAgeSec)

  const expandedView = (
    <ExpandedView
      slots={slots}
      currentBucketStart={currentBucketStart}
      boardText={boardText}
      boardColor={boardColor}
      gpsText={gpsText}
      gpsColor={gpsClr}
      boardTotal={boardTotal}
      gpsTotal={gpsTotal}
    />
  )

  return (
    <View style={styles.container}>
      {expanded ? (
        <Pressable onPress={() => setExpanded(false)}>{expandedView}</Pressable>
      ) : (
        <Pressable style={styles.bar} onPress={() => setExpanded(true)}>
          <View style={styles.sources}>
            <SourceGroup
              icon={<Lightning size={11} color={boardColor} weight="fill" />}
              label="Board:"
              slots={slots}
              getValue={(s) => s.boardCount}
              max={maxBoard}
              currentBucketStart={currentBucketStart}
              activeColor={theme.wheel.color}
              currentColor={theme.wheel.text}
              valueText={boardText}
              valueColor={boardColor}
            />
            <SourceGroup
              icon={<NavigationArrow size={11} color={gpsClr} weight="fill" />}
              label="GPS:"
              slots={slots}
              getValue={(s) => s.gpsCount}
              max={maxGps}
              currentBucketStart={currentBucketStart}
              activeColor={theme.gps.color}
              currentColor={theme.gps.text}
              valueText={gpsText}
              valueColor={gpsClr}
            />
          </View>
        </Pressable>
      )}
    </View>
  )
}

function SourceGroup({
  icon,
  label,
  slots,
  getValue,
  max,
  currentBucketStart,
  activeColor,
  currentColor,
  valueText,
  valueColor,
}: {
  icon: React.ReactNode
  label: string
  slots: BucketSlot[]
  getValue: (s: BucketSlot) => number
  max: number
  currentBucketStart: number
  activeColor: string
  currentColor: string
  valueText: string
  valueColor: string
}) {
  const hasData = slots.some((s) => getValue(s) > 0)
  return (
    <View style={styles.sourceGroup}>
      {icon}
      <Text style={styles.sourceGroupLabel}>{label}</Text>
      <View style={styles.miniBars}>
        {slots.map((slot) => {
          const count = getValue(slot)
          const isCurrent = slot.bucketStartMs === currentBucketStart
          const height = count > 0 ? Math.max(5, Math.round((count / max) * 14)) : 4
          const backgroundColor = !hasData
            ? '#1e293b'
            : count > 0
              ? isCurrent
                ? currentColor
                : activeColor
              : '#1e293b'
          return (
            <View key={slot.bucketStartMs} style={styles.miniBarSlot}>
              <View style={[styles.miniBar, { height, backgroundColor }]} />
            </View>
          )
        })}
      </View>
      <Text style={[styles.sourceGroupValue, { color: valueColor }]}>{valueText}</Text>
    </View>
  )
}

function ExpandedView({
  slots,
  currentBucketStart,
  boardText,
  boardColor,
  gpsText,
  gpsColor,
  boardTotal,
  gpsTotal,
}: {
  slots: BucketSlot[]
  currentBucketStart: number
  boardText: string
  boardColor: string
  gpsText: string
  gpsColor: string
  boardTotal: number
  gpsTotal: number
}) {
  const maxBoard = Math.max(1, ...slots.map((s) => s.boardCount))
  const maxGps = Math.max(1, ...slots.map((s) => s.gpsCount))

  return (
    <View style={styles.expanded}>
      <View style={styles.expandedSources}>
        <SourceChart
          icon={<Lightning size={10} color="#475569" weight="fill" />}
          label="Board"
          slots={slots}
          getValue={(s) => s.boardCount}
          max={maxBoard}
          currentBucketStart={currentBucketStart}
          activeColor={theme.wheel.color}
          currentColor={theme.wheel.text}
          total={boardTotal}
          statusText={boardText}
          statusColor={boardColor}
        />
        <View style={styles.expandedDivider} />
        <SourceChart
          icon={<NavigationArrow size={10} color="#475569" weight="fill" />}
          label="GPS"
          slots={slots}
          getValue={(s) => s.gpsCount}
          max={maxGps}
          currentBucketStart={currentBucketStart}
          activeColor={theme.gps.color}
          currentColor={theme.gps.text}
          total={gpsTotal}
          statusText={gpsText}
          statusColor={gpsColor}
        />
      </View>
      <Text style={styles.barsLabel}>
        Each bar shows data points collected per minute · last 10 min
      </Text>
    </View>
  )
}

function SourceChart({
  icon,
  label,
  slots,
  getValue,
  max,
  currentBucketStart,
  activeColor,
  currentColor,
  total,
  statusText,
  statusColor,
}: {
  icon: React.ReactNode
  label: string
  slots: BucketSlot[]
  getValue: (s: BucketSlot) => number
  max: number
  currentBucketStart: number
  activeColor: string
  currentColor: string
  total: number
  statusText: string
  statusColor: string
}) {
  const hasData = total > 0
  return (
    <View style={styles.sourceChart}>
      <View style={styles.sourceChartHeader}>
        <View style={styles.sourceChartTitle}>
          {icon}
          <Text style={styles.sourceChartLabel}>{label}</Text>
        </View>
        <Text style={[styles.sourceChartStatus, { color: statusColor }]}>{statusText}</Text>
        <Text style={[styles.sourceChartTotal, { color: hasData ? activeColor : '#334155' }]}>
          {total}
        </Text>
      </View>
      <View style={styles.bars}>
        {slots.map((slot) => {
          const count = getValue(slot)
          const isCurrent = slot.bucketStartMs === currentBucketStart
          const height = count > 0 ? Math.max(4, Math.round((count / max) * 28)) : 3
          const backgroundColor = !hasData
            ? '#1e293b'
            : count > 0
              ? isCurrent
                ? currentColor
                : activeColor
              : '#1e293b'
          return (
            <View key={slot.bucketStartMs} style={styles.barSlot}>
              <View style={[styles.barFill, { height, backgroundColor }]} />
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c1524',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  sources: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  sourceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sourceGroupLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  miniBars: {
    height: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  miniBarSlot: {
    width: 3,
    height: 16,
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: 3,
    borderRadius: 1,
  },
  sourceGroupValue: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    color: '#475569',
    fontSize: 10,
  },
  expanded: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  expandedSources: {
    flexDirection: 'row',
    gap: 10,
  },
  expandedDivider: {
    width: 1,
    backgroundColor: '#1e293b',
    alignSelf: 'stretch',
  },
  sourceChart: {
    flex: 1,
    gap: 4,
  },
  sourceChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sourceChartTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceChartLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  sourceChartStatus: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sourceChartTotal: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bars: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barSlot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  barFill: {
    borderRadius: 2,
  },
  barsLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
})

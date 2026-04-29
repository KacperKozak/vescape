import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBleStore } from '@/store/bleStore'
import { minuteBucketStart } from '@/store/liveMonitor'

type BucketSlot = { bucketStartMs: number; points: number; boardCount: number; gpsCount: number }

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

export function LiveStatusBar() {
  const { liveDataBuckets, liveLastPointAtMs } = useBleStore(
    useShallow((s) => ({
      liveDataBuckets: s.liveDataBuckets,
      liveLastPointAtMs: s.liveLastPointAtMs,
    })),
  )
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(interval)
  }, [])

  const ageMs = liveLastPointAtMs ? nowMs - liveLastPointAtMs : null
  const active = ageMs != null && ageMs < 15_000
  const boardCount = liveDataBuckets.reduce((total, b) => total + b.boardCount, 0)
  const gpsCount = liveDataBuckets.reduce((total, b) => total + b.gpsCount, 0)
  const { slots, currentBucketStart } = buildBucketSlots(liveDataBuckets, nowMs)

  return (
    <View style={styles.container}>
      <Pressable style={styles.bar} onPress={() => setExpanded(!expanded)}>
        <View style={[styles.dot, active && styles.dotActive]} />
        <Text style={styles.label} numberOfLines={1}>
          {active ? 'Receiving' : 'Idle'}
        </Text>
        <View style={styles.separator} />
        {!expanded && (
          <View style={styles.miniDots}>
            {slots.map((slot) => (
              <View
                key={slot.bucketStartMs}
                style={[
                  styles.miniDot,
                  slot.points > 0 && styles.miniDotFilled,
                  slot.bucketStartMs === currentBucketStart && styles.miniDotCurrent,
                ]}
              />
            ))}
          </View>
        )}
        <View style={styles.spacer} />
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded && (
        <ExpandedView
          slots={slots}
          currentBucketStart={currentBucketStart}
          boardCount={boardCount}
          gpsCount={gpsCount}
        />
      )}
    </View>
  )
}

function ExpandedView({
  slots,
  currentBucketStart,
  boardCount,
  gpsCount,
}: {
  slots: BucketSlot[]
  currentBucketStart: number
  boardCount: number
  gpsCount: number
}) {
  const maxPoints = Math.max(1, ...slots.map((s) => s.points))

  return (
    <View style={styles.expanded}>
      <View style={styles.bars}>
        {slots.map((slot) => {
          const isCurrent = slot.bucketStartMs === currentBucketStart
          const height =
            slot.points > 0 ? Math.max(4, Math.round((slot.points / maxPoints) * 28)) : 3
          return (
            <View key={slot.bucketStartMs} style={styles.barSlot}>
              <View
                style={[
                  styles.barFill,
                  slot.points === 0 && styles.barEmpty,
                  isCurrent && styles.barCurrent,
                  { height },
                ]}
              />
            </View>
          )
        })}
      </View>
      <Text style={styles.barsLabel}>10 min · points/min</Text>
      <View style={styles.metrics}>
        <MetricItem label="Board" value={String(boardCount)} />
        <MetricItem label="GPS" value={String(gpsCount)} />
        <MetricItem label="10 min" value={String(boardCount + gpsCount)} />
      </View>
    </View>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4b5563',
  },
  dotActive: {
    backgroundColor: '#22c55e',
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  separator: {
    width: 1,
    height: 10,
    backgroundColor: '#334155',
  },
  miniDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1e293b',
  },
  miniDotFilled: {
    backgroundColor: '#3b82f6',
  },
  miniDotCurrent: {
    backgroundColor: '#22c55e',
  },
  spacer: { flex: 1 },
  chevron: {
    color: '#475569',
    fontSize: 10,
  },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
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
    backgroundColor: '#3b82f6',
  },
  barCurrent: {
    backgroundColor: '#22c55e',
  },
  barEmpty: {
    backgroundColor: '#1e293b',
  },
  barsLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  metrics: {
    flexDirection: 'row',
    gap: 4,
  },
  metricItem: {
    flex: 1,
    gap: 1,
  },
  metricLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  metricValue: {
    color: '#94a3b8',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
})

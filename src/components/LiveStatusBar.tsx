import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { useHistoryStore } from '@/store/historyStore'

type BucketSlot = { bucketStartMs: number; points: number }

function buildBucketSlots(
  liveBlocks: { bucketStartMs: number; sampleCount: number; gpsPointCount: number }[],
): { slots: BucketSlot[]; currentBucketStart: number } {
  const now = Date.now()
  const currentBucketStart = now - (now % 60_000)
  const blocksByStart = new Map(liveBlocks.map((b) => [b.bucketStartMs, b]))
  const slots = Array.from({ length: 10 }, (_, i) => {
    const bucketStartMs = currentBucketStart - (9 - i) * 60_000
    const block = blocksByStart.get(bucketStartMs)
    return { bucketStartMs, points: block ? block.sampleCount + block.gpsPointCount : 0 }
  })
  return { slots, currentBucketStart }
}

export function LiveStatusBar() {
  const { liveBlocks, summary, refreshLive } = useHistoryStore(
    useShallow((s) => ({
      liveBlocks: s.liveBlocks,
      summary: s.summary,
      refreshLive: s.refreshLive,
    })),
  )
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    void refreshLive()
    const interval = setInterval(() => void refreshLive(), 500)
    return () => clearInterval(interval)
  }, [refreshLive])

  if (!summary) return null

  const lastAt = summary.lastAtMs
  const ageMs = lastAt ? Date.now() - lastAt : null
  const active = ageMs != null && ageMs < 15_000
  const boardCount = liveBlocks.reduce((total, b) => total + b.sampleCount, 0)
  const gpsCount = liveBlocks.reduce((total, b) => total + b.gpsPointCount, 0)
  const totalPoints = boardCount + gpsCount
  const { slots, currentBucketStart } = buildBucketSlots(liveBlocks)

  return (
    <View style={styles.container}>
      <Pressable style={styles.bar} onPress={() => setExpanded(!expanded)}>
        <View style={[styles.dot, active && styles.dotActive]} />
        <Text style={styles.label} numberOfLines={1}>
          {active ? 'Collecting' : 'Idle'}
        </Text>
        <Text style={styles.age}>
          {ageMs == null ? '' : `${Math.max(0, Math.round(ageMs / 1000))}s`}
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
                  slot.bucketStartMs === currentBucketStart &&
                    slot.points > 0 &&
                    styles.miniDotCurrent,
                ]}
              />
            ))}
          </View>
        )}
        <Text style={styles.count}>{totalPoints} pts</Text>
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded && (
        <ExpandedView
          slots={slots}
          currentBucketStart={currentBucketStart}
          boardCount={boardCount}
          gpsCount={gpsCount}
          summary={summary}
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
  summary,
}: {
  slots: BucketSlot[]
  currentBucketStart: number
  boardCount: number
  gpsCount: number
  summary: { sampleCount: number; gpsPointCount: number }
}) {
  const maxPoints = Math.max(1, ...slots.map((s) => s.points))
  const topSpeed = 0 // derived from liveBlocks[0] in parent if needed

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
        <MetricItem label="Total" value={String(summary.sampleCount + summary.gpsPointCount)} />
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
  age: {
    color: '#64748b',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
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
  count: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CaretRightIcon } from 'phosphor-react-native'
import { addTelemetryListener } from 'vesc-ble'

import {
  PollIntervalPickerModal,
  formatPollInterval,
} from '@/components/domain/board/PollIntervalPickerModal'
import { useBoardStore } from '@/store/boardStore'
import { interaction, theme } from '@/constants/theme'

const MAX_GAPS = 200
const BATCH_THRESHOLD_MS = 50
const REFRESH_INTERVAL_MS = 250

interface TimingStats {
  totalMessages: number
  messagesPerSec: number
  jsGapAvg: number | null
  jsGapMin: number | null
  jsGapMax: number | null
  nativeGapAvg: number | null
  nativeGapMin: number | null
  nativeGapMax: number | null
  nativeLatencyAvg: number | null
  batchCount: number
  avgBatchSize: number | null
  recentJsGaps: number[]
  recentNativeGaps: number[]
}

const EMPTY_STATS: TimingStats = {
  totalMessages: 0,
  messagesPerSec: 0,
  jsGapAvg: null,
  jsGapMin: null,
  jsGapMax: null,
  nativeGapAvg: null,
  nativeGapMin: null,
  nativeGapMax: null,
  nativeLatencyAvg: null,
  batchCount: 0,
  avgBatchSize: null,
  recentJsGaps: [],
  recentNativeGaps: [],
}

interface ArrivalRecord {
  jsArrivalMs: number
  nativePacketAt: number
  nativeLatency: number | null
}

function computeStats(arrivals: ArrivalRecord[], startedAt: number): TimingStats {
  if (arrivals.length === 0) return EMPTY_STATS

  const elapsedSec = (performance.now() - startedAt) / 1000
  const messagesPerSec = elapsedSec > 0 ? arrivals.length / elapsedSec : 0

  const jsGaps: number[] = []
  const nativeGaps: number[] = []
  const latencies: number[] = []

  for (let i = 1; i < arrivals.length; i++) {
    jsGaps.push(arrivals[i].jsArrivalMs - arrivals[i - 1].jsArrivalMs)
    nativeGaps.push(arrivals[i].nativePacketAt - arrivals[i - 1].nativePacketAt)
    if (arrivals[i].nativeLatency != null) latencies.push(arrivals[i].nativeLatency!)
  }

  let batchCount = 0
  let totalBatchMessages = 0
  let inBatch = false

  for (const gap of jsGaps) {
    if (gap < BATCH_THRESHOLD_MS) {
      if (!inBatch) {
        batchCount++
        totalBatchMessages += 1
        inBatch = true
      }
      totalBatchMessages++
    } else {
      inBatch = false
    }
  }

  return {
    totalMessages: arrivals.length,
    messagesPerSec,
    jsGapAvg: avg(jsGaps),
    jsGapMin: jsGaps.length > 0 ? Math.min(...jsGaps) : null,
    jsGapMax: jsGaps.length > 0 ? Math.max(...jsGaps) : null,
    nativeGapAvg: avg(nativeGaps),
    nativeGapMin: nativeGaps.length > 0 ? Math.min(...nativeGaps) : null,
    nativeGapMax: nativeGaps.length > 0 ? Math.max(...nativeGaps) : null,
    nativeLatencyAvg: avg(latencies),
    batchCount,
    avgBatchSize: batchCount > 0 ? totalBatchMessages / batchCount : null,
    recentJsGaps: jsGaps.slice(-60),
    recentNativeGaps: nativeGaps.slice(-60),
  }
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

function fmt(value: number | null, decimals = 1, suffix = ''): string {
  if (value == null) return '—'
  return value.toFixed(decimals) + suffix
}

export default function TelemetryTimingScreen() {
  const arrivalsRef = useRef<ArrivalRecord[]>([])
  const startedAtRef = useRef(performance.now())
  const [stats, setStats] = useState<TimingStats>(EMPTY_STATS)
  const [pollPickerVisible, setPollPickerVisible] = useState(false)

  const boards = useBoardStore((s) => s.boards)
  const activeBoardId = useBoardStore((s) => s.activeBoardId)
  const updateBoard = useBoardStore((s) => s.updateBoard)
  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const pollIntervalMs = activeBoard?.pollIntervalMs ?? 100

  const handlePollIntervalChange = useCallback(
    (ms: number) => {
      if (!activeBoard) return
      void updateBoard({ ...activeBoard, pollIntervalMs: ms })
      setPollPickerVisible(false)
    },
    [activeBoard, updateBoard],
  )

  const reset = useCallback(() => {
    arrivalsRef.current = []
    startedAtRef.current = performance.now()
    setStats(EMPTY_STATS)
  }, [])

  useEffect(() => {
    const sub = addTelemetryListener((telemetry) => {
      const arrivals = arrivalsRef.current
      arrivals.push({
        jsArrivalMs: performance.now(),
        nativePacketAt: telemetry.lastPacketAt,
        nativeLatency: telemetry.avgLatency ?? null,
      })
      if (arrivals.length > MAX_GAPS) {
        arrivals.splice(0, arrivals.length - MAX_GAPS)
      }
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setStats(computeStats(arrivalsRef.current, startedAtRef.current))
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const jsGapMax = stats.jsGapMax ?? 1

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Poll rate</Text>
        <Pressable
          style={({ pressed }) => [styles.card, styles.pollRow, pressed && styles.pollRowPressed]}
          android_ripple={interaction.ripple}
          onPress={() => setPollPickerVisible(true)}
        >
          <View style={styles.pollBody}>
            <Text style={styles.pollLabel}>
              {activeBoard ? formatPollInterval(pollIntervalMs) : 'No board'}
            </Text>
            <Text style={styles.pollHint}>Takes effect immediately</Text>
          </View>
          <CaretRightIcon size={16} color={theme.neutral.textMuted} />
        </Pressable>

        <PollIntervalPickerModal
          visible={pollPickerVisible}
          pollIntervalMs={pollIntervalMs}
          onSelect={handlePollIntervalChange}
          onCancel={() => setPollPickerVisible(false)}
        />

        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.card}>
          <DiagRow label="Total messages" value={String(stats.totalMessages)} />
          <DiagRow label="Messages/sec" value={fmt(stats.messagesPerSec)} />
          <DiagRow label="Native avg latency" value={fmt(stats.nativeLatencyAvg, 1, ' ms')} />
        </View>

        <Text style={styles.sectionTitle}>JS arrival gaps</Text>
        <View style={styles.card}>
          <DiagRow label="Avg" value={fmt(stats.jsGapAvg, 1, ' ms')} />
          <DiagRow label="Min" value={fmt(stats.jsGapMin, 1, ' ms')} />
          <DiagRow label="Max" value={fmt(stats.jsGapMax, 1, ' ms')} />
        </View>

        <Text style={styles.sectionTitle}>Native packet gaps</Text>
        <View style={styles.card}>
          <DiagRow label="Avg" value={fmt(stats.nativeGapAvg, 1, ' ms')} />
          <DiagRow label="Min" value={fmt(stats.nativeGapMin, 1, ' ms')} />
          <DiagRow label="Max" value={fmt(stats.nativeGapMax, 1, ' ms')} />
        </View>

        <Text style={styles.sectionTitle}>
          {'Batch detection (<' + BATCH_THRESHOLD_MS + 'ms gap)'}
        </Text>
        <View style={styles.card}>
          <DiagRow label="Batches detected" value={String(stats.batchCount)} />
          <DiagRow label="Avg batch size" value={fmt(stats.avgBatchSize, 1, ' msgs')} />
        </View>

        {stats.recentJsGaps.length > 0 && (
          <>
            <View style={styles.legendRow}>
              <Text style={styles.sectionTitle}>Recent JS gaps</Text>
              <Text style={styles.resetButton} onPress={reset}>
                Reset
              </Text>
            </View>
            <View style={styles.chartCard}>
              <GapChart gaps={stats.recentJsGaps} maxValue={jsGapMax} color={theme.bran.color} />
            </View>

            <Text style={styles.sectionTitle}>Recent native gaps</Text>
            <View style={styles.chartCard}>
              <GapChart gaps={stats.recentNativeGaps} maxValue={jsGapMax} color={theme.gps.color} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {value}
      </Text>
    </View>
  )
}

function GapChart({ gaps, maxValue, color }: { gaps: number[]; maxValue: number; color: string }) {
  const barWidth = 100 / gaps.length

  return (
    <View style={styles.chart}>
      {gaps.map((gap, i) => {
        const heightPct = maxValue > 0 ? Math.min((gap / maxValue) * 100, 100) : 0
        const isBatch = gap < BATCH_THRESHOLD_MS
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                width: `${barWidth}%`,
                height: `${heightPct}%`,
                backgroundColor: isBatch ? theme.neutral.textMuted : color,
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    overflow: 'hidden',
  },
  chartCard: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    overflow: 'hidden',
    padding: 8,
    height: 120,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.neutral.border,
  },
  rowLabel: {
    flex: 1,
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    flex: 1,
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  resetButton: {
    color: theme.bran.color,
    fontSize: 13,
    fontWeight: '600',
  },
  chart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bar: {
    minWidth: 2,
    borderRadius: 1,
  },
  pollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  pollRowPressed: {
    backgroundColor: interaction.pressedBg,
  },
  pollBody: {
    flex: 1,
    gap: 2,
  },
  pollLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  pollHint: {
    color: theme.neutral.textMuted,
    fontSize: 12,
  },
})

import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated'
import { Text } from '@/components/ui/base/Text'

import {
  cellBarScale,
  nearestBmsFrameAtTime,
  summarizeBms,
  summarizeBmsWindow,
  type BmsCellGroup,
  type BmsSummary,
  type BmsWindowStats,
} from '@/lib/battery'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { theme } from '@/constants/theme'

const formatCell = (v: number) => `${v.toFixed(3)}V`
const formatSpread = (v: number) => `${v.toFixed(3)}V`

function formatWindowLabel(windowMs: number | null | undefined): string {
  if (!windowMs) return 'WINDOW'
  const minutes = Math.round(windowMs / 60_000)
  if (minutes >= 1) return `${minutes} MIN`
  return `${Math.round(windowMs / 1000)} SEC`
}

export function BmsCellVoltages({
  scrubTimeMs,
  windowMs,
}: {
  scrubTimeMs?: SharedValue<number | null>
  windowMs?: number
}) {
  const latestBms = useBleStore((s) => s.latestBms)
  const bmsSeries = useBleStore((s) => s.bmsSeries)
  const bmsSeriesWindowMs = useBleStore((s) => s.bmsSeriesWindowMs)
  const [cursorTimeMs, setCursorTimeMs] = useState<number | null>(null)
  useAnimatedReaction(
    () => scrubTimeMs?.value ?? null,
    (next, prev) => {
      if (next === prev) return
      runOnJS(setCursorTimeMs)(next)
    },
    [scrubTimeMs],
  )

  const bms = useMemo(
    () => (cursorTimeMs == null ? latestBms : nearestBmsFrameAtTime(bmsSeries, cursorTimeMs)),
    [bmsSeries, cursorTimeMs, latestBms],
  )
  const summary = useMemo(() => summarizeBms(bms), [bms])
  const windowStats = useMemo(() => summarizeBmsWindow(bmsSeries), [bmsSeries])
  // BMS is polled only when the probe proved one (`hasBms === true`); anything else
  // is never polled, so the empty state is definitive, not an indefinite "waiting".
  const bmsLinked = useBoardStore(
    (s) => s.boards.find((b) => b.id === s.activeBoardId)?.link?.hasBms === true,
  )

  if (!summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>CELL GROUPS</Text>
        <Text style={styles.empty}>
          {bmsLinked
            ? 'No smart-BMS data yet.'
            : 'No smart-BMS detected. Re-link a board with a BMS over CAN.'}
        </Text>
      </View>
    )
  }

  return (
    <BmsCellVoltagesView
      summary={summary}
      windowStats={windowStats}
      windowMs={bmsSeriesWindowMs ?? windowMs}
    />
  )
}

/** Presentational cell-group card, driven by a precomputed summary (showcase-friendly). */
export function BmsCellVoltagesView({
  summary,
  windowStats,
  windowMs,
}: {
  summary: BmsSummary
  windowStats?: BmsWindowStats | null
  windowMs?: number | null
}) {
  const scale = cellBarScale(summary.minVoltage, summary.maxVoltage)
  const windowLabel = formatWindowLabel(windowMs)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CELL GROUPS · {summary.cellCount}S</Text>
      </View>
      <View style={styles.summaryRow}>
        <Stat label="Δ SPREAD" value={`${summary.spread.toFixed(3)}V`} tone="spread" />
        <Stat label="MIN" value={formatCell(summary.minVoltage)} tone="min" />
        <Stat label="AVG" value={formatCell(summary.average)} tone="neutral" />
        <Stat label="MAX" value={formatCell(summary.maxVoltage)} tone="max" />
      </View>
      <View style={styles.windowStatsRow}>
        <Stat
          label={`PEAK Δ (${windowLabel})`}
          value={windowStats ? formatSpread(windowStats.peakSpread) : '--'}
          tone="spread"
        />
        <Stat
          label="WORST GROUP"
          value={
            windowStats?.worstGroupIndex == null ? '--' : `G${windowStats.worstGroupIndex + 1}`
          }
          tone="min"
        />
      </View>
      <View style={styles.rows}>
        {summary.groups.map((group) => (
          <CellRow key={group.index} group={group} low={scale.low} high={scale.high} />
        ))}
      </View>
    </View>
  )
}

function CellRow({ group, low, high }: { group: BmsCellGroup; low: number; high: number }) {
  const fraction = Math.max(0, Math.min(1, (group.voltage - low) / (high - low)))
  const color =
    group.extreme === 'min'
      ? theme.status.warning.color
      : group.extreme === 'max'
        ? theme.palette.yellow.color
        : theme.palette.green.color

  return (
    <View style={styles.row}>
      <Text style={styles.rowIndex}>{group.index + 1}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barLine, { width: `${fraction * 100}%`, backgroundColor: color }]} />
        {group.balancing ? <View style={styles.balanceDot} /> : null}
      </View>
      <Text style={[styles.rowValue, { color }]} numberOfLines={1}>
        {formatCell(group.voltage)}
      </Text>
    </View>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'min' | 'max' | 'neutral' | 'spread'
}) {
  const color =
    tone === 'min'
      ? theme.status.warning.text
      : tone === 'max'
        ? theme.palette.yellow.text
        : tone === 'spread'
          ? theme.palette.green.text
          : theme.palette.slate.textPrimary
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  empty: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  windowStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  rows: {
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowIndex: {
    color: theme.palette.slate.textDim,
    fontSize: 8,
    fontWeight: '600',
    fontFamily: 'monospace',
    width: 14,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 9,
    justifyContent: 'center',
  },
  barLine: {
    height: 2,
    borderRadius: 1,
  },
  balanceDot: {
    position: 'absolute',
    right: 0,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.palette.green.color,
  },
  rowValue: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
    width: 42,
    textAlign: 'right',
  },
})

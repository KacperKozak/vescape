import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import type { BmsEvent, BmsSeriesFrame } from 'vescape-core'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { AnimatedValueText } from '@/components/base/AnimatedValueText'
import { Text } from '@/components/base/Text'

import {
  cellBarScale,
  summarizeBms,
  summarizeBmsWindow,
  type BmsCellGroup,
  type BmsSummary,
  type BmsWindowStats,
} from '@/modules/battery/lib'
import { useRenderRateWarning } from '@/hooks/useRenderRateWarning'
import { useBleStore } from '@/modules/board/store/bleStore'
import { useBoardStore } from '@/modules/board/store/boardStore'
import { theme } from '@/constants/theme'

const COLOR_MIN = theme.status.warning.color
const COLOR_MAX = theme.palette.yellow.color
const COLOR_NORMAL = theme.palette.green.color

const formatCell = (v: number) => `${v.toFixed(3)}V`
const formatSpread = (v: number) => `${v.toFixed(3)}V`

function formatWindowLabel(windowMs: number | null | undefined): string {
  if (!windowMs) return 'WINDOW'
  const minutes = Math.round(windowMs / 60_000)
  if (minutes >= 1) return `${minutes} MIN`
  return `${Math.round(windowMs / 1000)} SEC`
}

function groupColor(extreme: BmsCellGroup['extreme']): string {
  'worklet'
  return extreme === 'min' ? COLOR_MIN : extreme === 'max' ? COLOR_MAX : COLOR_NORMAL
}

function nearestTimeIndex(times: number[], timeMs: number): number {
  'worklet'
  const count = times.length
  if (count === 0) return -1
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (times[mid] < timeMs) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  const prev = lo - 1
  return Math.abs(times[prev] - timeMs) <= Math.abs(times[lo] - timeMs) ? prev : lo
}

/**
 * Fully UI-thread-driven cell card: BMS frames stream straight into shared values
 * (one write per store event), the displayed summary is derived in worklets from the
 * shared scrub cursor, and every bar/number is an animated style or animated text.
 * React renders the row skeleton once per cell-count change — scrubbing and live
 * updates cause zero re-renders.
 */
export function BmsCellVoltages({
  scrubTimeMs,
  windowMs,
}: {
  scrubTimeMs?: SharedValue<number | null>
  windowMs?: number
}) {
  // Canary: this component must not re-render during scrubbing or live streaming.
  useRenderRateWarning('BmsCellVoltages')
  const bmsSeriesWindowMs = useBleStore((s) => s.bmsSeriesWindowMs)
  // Skeleton only depends on the group count (primitive selector → renders only on change).
  const groupCount = useBleStore((s) => s.latestBms?.cellVoltages.length ?? 0)
  // BMS is polled only when the probe proved one (`hasBms === true`); anything else
  // is never polled, so the empty state is definitive, not an indefinite "waiting".
  const bmsLinked = useBoardStore(
    (s) => s.boards.find((b) => b.id === s.activeBoardId)?.link?.hasBms === true,
  )

  // Store → shared values, no React pass. Summaries are reduced on JS where the data
  // is plain (native event objects don't survive shareable conversion intact), and only
  // small results cross to the UI thread. Scrub history crosses as flat number arrays —
  // cheap to convert, impossible to mangle — flattened once per series change (~1Hz).
  const liveSummarySV = useSharedValue<BmsSummary | null>(null)
  const windowStatsSV = useSharedValue<BmsWindowStats | null>(null)
  const frameTimesSV = useSharedValue<number[]>([])
  const frameCellsSV = useSharedValue<number[]>([])
  const frameBalancingSV = useSharedValue<number[]>([])
  const frameCellCountSV = useSharedValue(0)
  useEffect(() => {
    let lastLatest: BmsEvent | null | undefined
    let lastSeries: BmsSeriesFrame[] | undefined
    const apply = (state: ReturnType<typeof useBleStore.getState>) => {
      if (state.latestBms !== lastLatest) {
        lastLatest = state.latestBms
        liveSummarySV.value = summarizeBms(state.latestBms)
      }
      if (state.bmsSeries !== lastSeries) {
        lastSeries = state.bmsSeries
        windowStatsSV.value = summarizeBmsWindow(state.bmsSeries)
        const cellCount = state.bmsSeries.at(-1)?.cellVoltages.length ?? 0
        const times: number[] = []
        const cells: number[] = []
        const balancing: number[] = []
        for (const frame of state.bmsSeries) {
          if (frame.cellVoltages.length !== cellCount) continue
          times.push(frame.capturedAt)
          for (let i = 0; i < cellCount; i += 1) {
            cells.push(frame.cellVoltages[i])
            balancing.push(frame.balancing[i] ? 1 : 0)
          }
        }
        frameCellCountSV.value = cellCount
        frameTimesSV.value = times
        frameCellsSV.value = cells
        frameBalancingSV.value = balancing
      }
    }
    apply(useBleStore.getState())
    return useBleStore.subscribe(apply)
  }, [liveSummarySV, windowStatsSV, frameTimesSV, frameCellsSV, frameBalancingSV, frameCellCountSV])

  // Displayed summary: scrub cursor → nearest retained frame (rebuilt from flat lanes
  // in the worklet), otherwise the live JS-reduced summary.
  const summarySV = useDerivedValue<BmsSummary | null>(() => {
    const cursor = scrubTimeMs?.value ?? null
    if (cursor == null) return liveSummarySV.value
    const times = frameTimesSV.value
    const idx = nearestTimeIndex(times, cursor)
    if (idx < 0) return liveSummarySV.value
    const cellCount = frameCellCountSV.value
    const cells = frameCellsSV.value
    const balancingFlags = frameBalancingSV.value
    const start = idx * cellCount
    const cellVoltages: number[] = []
    const balancing: boolean[] = []
    for (let i = 0; i < cellCount; i += 1) {
      cellVoltages.push(cells[start + i])
      balancing.push(balancingFlags[start + i] === 1)
    }
    return summarizeBms({ cellVoltages, balancing })
  })
  const scaleSV = useDerivedValue(() => {
    const summary = summarySV.value
    return summary ? cellBarScale(summary.minVoltage, summary.maxVoltage) : { low: 0, high: 1 }
  })

  const spreadText = useDerivedValue(() => {
    const s = summarySV.value
    return s ? `${s.spread.toFixed(3)}V` : '--'
  })
  const minText = useDerivedValue(() => {
    const s = summarySV.value
    return s ? `${s.minVoltage.toFixed(3)}V` : '--'
  })
  const avgText = useDerivedValue(() => {
    const s = summarySV.value
    return s ? `${s.average.toFixed(3)}V` : '--'
  })
  const maxText = useDerivedValue(() => {
    const s = summarySV.value
    return s ? `${s.maxVoltage.toFixed(3)}V` : '--'
  })
  const peakSpreadText = useDerivedValue(() => {
    const stats = windowStatsSV.value
    return stats ? `${stats.peakSpread.toFixed(3)}V` : '--'
  })
  const worstGroupText = useDerivedValue(() => {
    const stats = windowStatsSV.value
    return stats?.worstGroupIndex == null ? '--' : `G${stats.worstGroupIndex + 1}`
  })

  const windowLabel = formatWindowLabel(bmsSeriesWindowMs ?? windowMs)

  if (groupCount === 0) {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CELL GROUPS · {groupCount}S</Text>
      </View>
      <View style={styles.summaryRow}>
        <LiveStat label="Δ SPREAD" text={spreadText} tone="spread" />
        <LiveStat label="MIN" text={minText} tone="min" />
        <LiveStat label="AVG" text={avgText} tone="neutral" />
        <LiveStat label="MAX" text={maxText} tone="max" />
      </View>
      <View style={styles.windowStatsRow}>
        <LiveStat label={`PEAK Δ (${windowLabel})`} text={peakSpreadText} tone="spread" />
        <LiveStat label="WORST GROUP" text={worstGroupText} tone="min" />
      </View>
      <View style={styles.rows}>
        {Array.from({ length: groupCount }, (_, index) => (
          <LiveCellRow key={index} index={index} summary={summarySV} scale={scaleSV} />
        ))}
      </View>
    </View>
  )
}

function LiveCellRow({
  index,
  summary,
  scale,
}: {
  index: number
  summary: DerivedValue<BmsSummary | null>
  scale: DerivedValue<{ low: number; high: number }>
}) {
  const barStyle = useAnimatedStyle(() => {
    const group = summary.value?.groups[index]
    if (!group) return { width: '0%', backgroundColor: COLOR_NORMAL }
    const { low, high } = scale.value
    const span = high - low
    const fraction = Math.max(0, Math.min(1, (group.voltage - low) / (span > 0 ? span : 1)))
    return { width: `${fraction * 100}%`, backgroundColor: groupColor(group.extreme) }
  })
  const dotStyle = useAnimatedStyle(() => ({
    opacity: summary.value?.groups[index]?.balancing ? 1 : 0,
  }))
  const voltageText = useDerivedValue(() => {
    const group = summary.value?.groups[index]
    return group ? `${group.voltage.toFixed(3)}V` : ''
  })
  const voltageStyle = useAnimatedStyle(() => ({
    color: groupColor(summary.value?.groups[index]?.extreme ?? null),
  }))

  return (
    <View style={styles.row}>
      <Text style={styles.rowIndex}>{index + 1}</Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barLine, barStyle]} />
        <Animated.View style={[styles.balanceDot, dotStyle]} />
      </View>
      <AnimatedValueText text={voltageText} style={[styles.rowValue, voltageStyle]} />
    </View>
  )
}

function statColor(tone: 'min' | 'max' | 'neutral' | 'spread'): string {
  return tone === 'min'
    ? theme.status.warning.text
    : tone === 'max'
      ? theme.palette.yellow.text
      : tone === 'spread'
        ? theme.palette.green.text
        : theme.palette.slate.textPrimary
}

function LiveStat({
  label,
  text,
  tone,
}: {
  label: string
  text: DerivedValue<string>
  tone: 'min' | 'max' | 'neutral' | 'spread'
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <AnimatedValueText text={text} style={[styles.statValue, { color: statColor(tone) }]} />
    </View>
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
  const color = groupColor(group.extreme)

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
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: statColor(tone) }]}>{value}</Text>
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

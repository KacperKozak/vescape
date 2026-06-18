import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { summarizeBms, type BmsCellGroup } from '@/lib/battery'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { theme } from '@/constants/theme'

// Per-group fill is mapped over a typical li-ion working window so a near-empty
// group reads short and a full one reads tall, independent of pack chemistry config.
const CELL_MIN_V = 3.0
const CELL_MAX_V = 4.2

const formatCell = (v: number) => `${v.toFixed(2)}V`

export function BmsCellVoltages() {
  const bms = useBleStore((s) => s.latestBms)
  const summary = useMemo(() => summarizeBms(bms), [bms])
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CELL GROUPS · {summary.cellCount}S</Text>
        <Text style={styles.spread}>Δ {(summary.spread * 1000).toFixed(0)} mV</Text>
      </View>
      <View style={styles.summaryRow}>
        <Stat label="MIN" value={formatCell(summary.minVoltage)} tone="min" />
        <Stat label="AVG" value={formatCell(summary.average)} tone="neutral" />
        <Stat label="MAX" value={formatCell(summary.maxVoltage)} tone="max" />
      </View>
      <View style={styles.grid}>
        {summary.groups.map((group) => (
          <CellBar key={group.index} group={group} />
        ))}
      </View>
    </View>
  )
}

function CellBar({ group }: { group: BmsCellGroup }) {
  const fraction = Math.max(
    0,
    Math.min(1, (group.voltage - CELL_MIN_V) / (CELL_MAX_V - CELL_MIN_V)),
  )
  const color =
    group.extreme === 'min'
      ? theme.warning.color
      : group.extreme === 'max'
        ? theme.highlight.color
        : theme.wheel.color

  return (
    <View style={styles.cell}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { height: `${fraction * 100}%`, backgroundColor: color }]} />
        {group.balancing ? <View style={styles.balanceDot} /> : null}
      </View>
      <Text style={[styles.cellValue, { color }]} numberOfLines={1}>
        {group.voltage.toFixed(2)}
      </Text>
      <Text style={styles.cellIndex}>{group.index + 1}</Text>
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
  tone: 'min' | 'max' | 'neutral'
}) {
  const color =
    tone === 'min'
      ? theme.warning.text
      : tone === 'max'
        ? theme.highlight.text
        : theme.neutral.textPrimary
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  spread: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  empty: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    color: theme.neutral.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    alignItems: 'center',
    gap: 3,
    width: 40,
  },
  barTrack: {
    width: 22,
    height: 56,
    borderRadius: 5,
    backgroundColor: theme.neutral.surfaceDeep,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 5,
  },
  balanceDot: {
    position: 'absolute',
    top: 3,
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.gps.color,
  },
  cellValue: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  cellIndex: {
    color: theme.neutral.textDim,
    fontSize: 9,
    fontWeight: '700',
  },
})

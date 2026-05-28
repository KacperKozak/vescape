import { forwardRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { InfoIcon, WarningIcon } from 'phosphor-react-native'

import type { BasicSliderItem } from '@/lib/tune/sliderDefinitions'
import { clamp, formatSliderValue } from '@/lib/tune/sliderDefinitions'
import { theme } from '@/constants/theme'

interface BasicSliderCellProps {
  item: BasicSliderItem
  editable: boolean
  onPress: () => void
  onInfo: () => void
  onResetFormula?: () => void
}

export const BasicSliderCell = forwardRef<View, BasicSliderCellProps>(function BasicSliderCell(
  { item, editable, onPress, onInfo, onResetFormula },
  ref,
) {
  const progress =
    item.value == null ? 0 : clamp(((item.value - item.min) / (item.max - item.min)) * 100, 0, 100)

  return (
    <View ref={ref} style={styles.wrapper}>
      <Pressable
        style={[
          styles.cell,
          item.value == null && styles.cellMissing,
          !editable && styles.cellReadOnly,
        ]}
        onPress={editable ? onPress : undefined}
      >
        <Pressable style={styles.infoBtn} onPress={onInfo}>
          <InfoIcon size={13} color="#64748b" weight="bold" />
        </Pressable>

        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {formatSliderValue(item)}
        </Text>

        <View style={styles.miniTrack}>
          <View style={[styles.miniFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.labelRow}>
          {item.modifiedManually ? (
            <Pressable onPress={onResetFormula} hitSlop={8}>
              <WarningIcon size={10} color="#fbbf24" weight="fill" />
            </Pressable>
          ) : null}
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
        <Text style={styles.source} numberOfLines={1}>
          {item.source}
        </Text>
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  wrapper: {
    width: '50%',
  },
  cell: {
    minHeight: 92,
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingLeft: 11,
    borderLeftWidth: 3,
    borderLeftColor: theme.wheel.color,
  },
  cellMissing: {
    opacity: 0.58,
    borderLeftColor: '#334155',
  },
  cellReadOnly: {
    borderLeftColor: '#334155',
  },
  infoBtn: {
    position: 'absolute',
    top: 9,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: '#e0f2fe',
    fontSize: 18,
    fontWeight: '800',
    paddingRight: 26,
    fontVariant: ['tabular-nums'],
  },
  miniTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0f172a',
    marginTop: 6,
    marginRight: 26,
    overflow: 'hidden',
  },
  miniFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: theme.wheel.color,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  source: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
})

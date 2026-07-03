import { forwardRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
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
          <InfoIcon size={13} color={theme.palette.slate.textDim} weight="bold" />
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
              <WarningIcon size={10} color={theme.palette.yellow.color} weight="fill" />
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
    flex: 1,
  },
  cell: {
    minHeight: 92,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surface,
  },
  cellMissing: {
    opacity: 0.58,
  },
  cellReadOnly: {
    borderColor: theme.palette.slate.border,
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
    color: theme.palette.slate.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    paddingRight: 26,
    fontVariant: ['tabular-nums'],
  },
  miniTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.palette.slate.surfaceDeep,
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
    backgroundColor: theme.palette.sky.color,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  label: {
    color: theme.palette.slate.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  source: {
    color: theme.palette.slate.textDim,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
})

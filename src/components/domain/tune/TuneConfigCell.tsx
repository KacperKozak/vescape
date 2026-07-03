import { forwardRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { ArrowCounterClockwiseIcon, CheckIcon, InfoIcon } from 'phosphor-react-native'
import type { RefloatConfigField, TuneProfileFieldValue } from 'vesc-ble'

import { isDisplayableFieldValue } from '@/lib/tune/fieldValues'
import { formatProfileValue } from '@/lib/tune/sliderDefinitions'
import { formatTuneValue } from '@/lib/tune/fields'
import { theme } from '@/constants/theme'

interface TuneConfigCellProps {
  field: RefloatConfigField
  savedValue: TuneProfileFieldValue | undefined
  boardValue: TuneProfileFieldValue | undefined
  profileValue: TuneProfileFieldValue | undefined
  dirty: boolean
  boardChanged: boolean
  onPress: () => void
  onInfo: () => void
  onRevert: () => void
  onAcceptBoard: () => void
}

export const TuneConfigCell = forwardRef<View, TuneConfigCellProps>(function TuneConfigCell(
  {
    field,
    savedValue,
    boardValue,
    profileValue,
    dirty,
    boardChanged,
    onPress,
    onInfo,
    onRevert,
    onAcceptBoard,
  },
  ref,
) {
  return (
    <View ref={ref} style={styles.cellWrapper}>
      <Pressable
        style={[styles.cell, dirty && styles.cellDirty, boardChanged && styles.cellBoardChanged]}
        onPress={onPress}
      >
        <Pressable style={styles.cellInfoButton} onPress={onInfo}>
          <InfoIcon size={13} color={theme.palette.slate.textDim} weight="bold" />
        </Pressable>
        {dirty ? (
          <Pressable style={styles.cellRevertButton} onPress={onRevert}>
            <ArrowCounterClockwiseIcon size={13} color={theme.palette.sky.text} weight="bold" />
          </Pressable>
        ) : null}
        {boardChanged && isDisplayableFieldValue(boardValue) ? (
          <Pressable style={styles.cellAcceptButton} onPress={onAcceptBoard}>
            <CheckIcon size={13} color={theme.palette.green.text} weight="bold" />
          </Pressable>
        ) : null}
        <Text style={styles.cellValue} numberOfLines={1} adjustsFontSizeToFit selectable>
          {formatTuneValue(field.value)}
        </Text>
        {dirty && isDisplayableFieldValue(savedValue) ? (
          <Text style={styles.cellOldValue} numberOfLines={1}>
            was {formatTuneValue(savedValue)}
          </Text>
        ) : null}
        {boardChanged ? (
          <Text style={styles.cellProfileValue} numberOfLines={1}>
            profile {formatProfileValue(profileValue)}
          </Text>
        ) : null}
        {boardChanged && isDisplayableFieldValue(boardValue) ? (
          <Text style={styles.cellBoardValue} numberOfLines={1}>
            board {formatTuneValue(boardValue)}
          </Text>
        ) : null}
        {field.unit ? (
          <Text style={styles.cellUnit} numberOfLines={1} selectable>
            {field.unit}
          </Text>
        ) : null}
        <Text style={styles.cellLabel} numberOfLines={2}>
          {field.label}
        </Text>
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  cellWrapper: {
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
  cellDirty: {
    backgroundColor: theme.palette.sky.bg,
    borderColor: theme.palette.sky.border,
  },
  cellBoardChanged: {
    backgroundColor: theme.palette.green.bg,
    borderColor: theme.palette.green.border,
  },
  cellInfoButton: {
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
  cellRevertButton: {
    position: 'absolute',
    top: 37,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.sky.bg,
  },
  cellAcceptButton: {
    position: 'absolute',
    top: 65,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.green.bg,
  },
  cellValue: {
    color: theme.palette.slate.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    paddingRight: 26,
    fontVariant: ['tabular-nums'],
  },
  cellOldValue: {
    color: theme.palette.sky.text,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    paddingRight: 26,
  },
  cellProfileValue: {
    color: theme.palette.slate.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    paddingRight: 26,
  },
  cellBoardValue: {
    color: theme.palette.green.text,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 1,
    paddingRight: 26,
  },
  cellUnit: {
    color: theme.palette.slate.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  cellLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
})

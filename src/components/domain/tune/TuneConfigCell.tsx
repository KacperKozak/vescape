import { forwardRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
          <InfoIcon size={13} color="#64748b" weight="bold" />
        </Pressable>
        {dirty ? (
          <Pressable style={styles.cellRevertButton} onPress={onRevert}>
            <ArrowCounterClockwiseIcon size={13} color="#bae6fd" weight="bold" />
          </Pressable>
        ) : null}
        {boardChanged && isDisplayableFieldValue(boardValue) ? (
          <Pressable style={styles.cellAcceptButton} onPress={onAcceptBoard}>
            <CheckIcon size={13} color="#bbf7d0" weight="bold" />
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
    width: '50%',
  },
  cell: {
    minHeight: 92,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  cellDirty: {
    backgroundColor: '#0c2537',
    borderRadius: 8,
  },
  cellBoardChanged: {
    backgroundColor: '#082f26',
    borderRadius: 8,
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
    backgroundColor: '#0f3650',
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
    backgroundColor: theme.gps.bg,
  },
  cellValue: {
    color: theme.neutral.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    paddingRight: 26,
    fontVariant: ['tabular-nums'],
  },
  cellOldValue: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    paddingRight: 26,
  },
  cellProfileValue: {
    color: theme.neutral.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    paddingRight: 26,
  },
  cellBoardValue: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 1,
    paddingRight: 26,
  },
  cellUnit: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  cellLabel: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
})

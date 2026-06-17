import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CheckCircleIcon, CircleIcon } from 'phosphor-react-native'
import type { BoardTransport } from 'vesc-ble'

import { formatBoardTransport } from '@/lib/boardTransport'
import { theme } from '@/constants/theme'

interface Props {
  candidates: BoardTransport[]
  selected: BoardTransport | null
  onSelect: (transport: BoardTransport) => void
  testIDPrefix: string
}

/** Selectable list of probe-confirmed Board Transports, first valid preselected. */
export function BoardProbeCandidates({ candidates, selected, onSelect, testIDPrefix }: Props) {
  return (
    <View style={styles.list}>
      {candidates.map((candidate) => {
        const isSelected = candidate === selected
        return (
          <Pressable
            key={String(candidate)}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => onSelect(candidate)}
            testID={`${testIDPrefix}-${candidate}`}
          >
            {isSelected ? (
              <CheckCircleIcon size={22} color={theme.wheel.color} weight="fill" />
            ) : (
              <CircleIcon size={22} color={theme.neutral.textMuted} weight="regular" />
            )}
            <Text style={styles.optionLabel}>{formatBoardTransport(candidate)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surface,
  },
  optionSelected: {
    borderColor: theme.wheel.color,
  },
  optionLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
})

import { StyleSheet, View } from 'react-native'
import { ShieldCheckIcon } from 'phosphor-react-native'
import { clearAllBoardWarnings, clearBoardWarning, type BoardWarning } from 'vesc-ble'

import { Button } from '@/components/ui/base/Button'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { BoardWarningRow } from '@/components/domain/warnings/BoardWarningRow'
import { theme } from '@/constants/theme'

interface BoardWarningsSheetProps {
  boardId: string
  warnings: BoardWarning[]
}

/**
 * Warnings sheet for the selected Board. Lists each Board Warning with a per-row clear, plus a
 * clear-all action — both call the native registry, and the mirror store updates from the resulting
 * `onBoardWarnings` emit, so this view never mutates local state itself.
 */
export function BoardWarningsSheet({ boardId, warnings }: BoardWarningsSheetProps) {
  if (warnings.length === 0) {
    return (
      <View style={styles.empty}>
        <Placeholder
          icon={ShieldCheckIcon}
          title="No warnings"
          description="This board is clean."
          iconColor={theme.status.success.color}
        />
      </View>
    )
  }

  return (
    <View style={styles.list}>
      {warnings.map((warning) => (
        <BoardWarningRow
          key={warning.kind}
          warning={warning}
          onClear={(kind) => void clearBoardWarning(boardId, kind)}
        />
      ))}
      <Button
        label="Clear all"
        variant="destructive"
        onPress={() => void clearAllBoardWarnings(boardId)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  empty: {
    paddingVertical: 12,
  },
})

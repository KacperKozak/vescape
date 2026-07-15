import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { WarningIcon } from 'phosphor-react-native'

import { EdgeDrawer } from '@/components/ui/overlays/AnchoredSheet'
import { BoardWarningsSheet } from '@/screens/center/BoardWarningsSheet'
import { severityStatus } from '@/constants/boardWarnings'
import { worstSeverity } from '@/lib/boardWarnings'
import { EMPTY_WARNINGS, useBoardWarningsStore } from '@/store/boardWarningsStore'
import { theme } from '@/constants/theme'

interface BoardWarningControlProps {
  boardId: string
}

/**
 * Severity-colored Board Warning icon for the top board bar, plus its warnings sheet. Renders nothing
 * when the board is clean — the absence of the icon is itself the "all good" signal. Warnings are
 * durable, so the icon stays for the selected board even while disconnected. Sits inside the board
 * pill, so it owns a leading divider to match the edit/disconnect controls.
 */
export function BoardWarningControl({ boardId }: BoardWarningControlProps) {
  const anchorRef = useRef<View>(null)
  const [open, setOpen] = useState(false)
  const warnings = useBoardWarningsStore((s) => s.warningsByBoard[boardId] ?? EMPTY_WARNINGS)
  const worst = worstSeverity(warnings)

  // Icon shows only when the board has warnings. The sheet stays mounted while open even after the
  // last warning is cleared from inside it, so it can show its empty state and animate closed rather
  // than being yanked out mid-interaction.
  if (!worst && !open) return null
  const color = severityStatus(worst ?? 'warn').color

  return (
    <>
      {worst && (
        <>
          <View style={styles.divider} />
          <View ref={anchorRef} collapsable={false}>
            <Pressable
              style={styles.button}
              onPress={() => setOpen(true)}
              testID="board-warnings-button"
              accessibilityLabel="Board warnings"
            >
              <WarningIcon size={16} color={color} weight="fill" />
            </Pressable>
          </View>
        </>
      )}

      <EdgeDrawer
        visible={open}
        triggerRef={anchorRef}
        title="Warnings"
        icon={WarningIcon}
        iconColor={color}
        onClose={() => setOpen(false)}
      >
        <BoardWarningsSheet boardId={boardId} warnings={warnings} />
      </EdgeDrawer>
    </>
  )
}

const styles = StyleSheet.create({
  divider: {
    width: 1,
    height: 20,
    backgroundColor: theme.palette.slate.border,
  },
  button: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

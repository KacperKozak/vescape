import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { LinkIcon } from 'phosphor-react-native'

import { BoardLinkTimeline } from '@/components/domain/board/BoardLinkTimeline'
import { IconHero } from '@/components/ui/settings/IconHero'
import { Button } from '@/components/ui/base/Button'
import { useBoardLink } from '@/hooks/useBoardLink'
import { formatBmsSuffix, formatBoardTransport } from '@/lib/boardTransport'
import { routes } from '@/navigation/routes'
import { useBoardStore } from '@/store/boardStore'
import { theme } from '@/constants/theme'

export default function BoardLinkScreen() {
  const {
    boardId,
    bleId: routeBleId,
    bleName,
  } = useLocalSearchParams<{
    boardId: string
    bleId?: string
    bleName?: string
  }>()
  const { board, updateBoard } = useBoardStore(
    useShallow((s) => ({
      board: s.boards.find((b) => b.id === boardId),
      updateBoard: s.updateBoard,
    })),
  )

  // The peripheral to link: a freshly-scanned device, else the board's existing
  // link (re-link). The existing link is left intact until a new one is saved —
  // a cancelled or failed re-link must not destroy a working link.
  const [bleId] = useState(() => routeBleId ?? board?.link?.bleId ?? null)
  const existingLink = board?.link ?? null

  const link = useBoardLink(bleId)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!board || !link.selectedLink) return
    setSaving(true)
    try {
      await updateBoard({ ...board, link: link.selectedLink })
      router.back()
    } finally {
      setSaving(false)
    }
  }

  const scanNewDevice = () => {
    router.push({ pathname: routes.addBoardScan, params: { boardId } })
  }

  const deviceLabel = board?.name?.trim() || bleName || bleId || 'Board'

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <IconHero
        icon={LinkIcon}
        title={deviceLabel}
        description="Linking your board over Bluetooth"
      />
      <ScrollView contentContainerStyle={styles.content}>
        {bleId != null ? (
          <BoardLinkTimeline
            phase={link.phase}
            progress={link.progress}
            candidates={link.candidates}
            selected={link.selected}
            onSelect={link.select}
            deviceLabel={deviceLabel}
            hideHeader
            bleId={bleId}
            testIDPrefix="board-link"
            failureNote={
              existingLink
                ? `Existing link kept · ${formatBoardTransport(existingLink.transport)}${formatBmsSuffix(existingLink.hasBms)}`
                : undefined
            }
          />
        ) : null}
      </ScrollView>

      {link.phase === 'failed' ? (
        <View style={[styles.footer, styles.actionRow]}>
          <Button
            style={styles.actionButton}
            label="Scan new device"
            variant="secondary"
            onPress={scanNewDevice}
            testID="board-link-choose-another"
          />
          <Button
            style={styles.actionButton}
            label="Retry"
            onPress={link.retry}
            testID="board-link-retry"
          />
        </View>
      ) : (
        <View style={styles.footer}>
          <Button
            label="Save link"
            onPress={handleSave}
            disabled={link.phase !== 'picking' || link.selectedLink == null}
            loading={saving}
            testID="board-link-save"
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
})

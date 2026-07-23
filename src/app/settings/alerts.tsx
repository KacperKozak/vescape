import { StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BellRingingIcon } from 'phosphor-react-native'

import { theme } from '@/constants/theme'
import { IconHero } from '@/components/settings/IconHero'
import { BoardTopSpeedCard } from '@/modules/alerts/components/BoardTopSpeedCard'
import { boardTopSpeedKmh } from '@/modules/alerts/lib/boardAlertSettings'
import { useAlertPresetStore } from '@/modules/alerts/store/alertPresetStore'
import { useBoardStore } from '@/modules/board/store/boardStore'

export default function AlertsSettingsScreen() {
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))
  const updateBoard = useBoardStore((s) => s.updateBoard)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={BellRingingIcon} description="Adjust your alert settings." />
        {board ? (
          <BoardTopSpeedCard
            value={boardTopSpeedKmh(board)}
            onChange={(kmh) => {
              void updateBoard({ ...board, topSpeedKmh: kmh }).then(() =>
                useAlertPresetStore.getState().regenerateSpeed(),
              )
            }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
})

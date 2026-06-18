import { useCallback, useLayoutEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { PencilSimpleIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { BoardBatteryEditorModal } from '@/components/domain/board/BoardBatteryEditorModal'
import { BoardInfoEditorModal } from '@/components/domain/board/BoardInfoEditorModal'
import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { EditBoardSettings } from '@/components/domain/board/EditBoardSettings'
import { useEditBoardForm } from '@/hooks/useEditBoardForm'
import { routes } from '@/navigation/routes'
import { useBoardStore } from '@/store/boardStore'
import { theme } from '@/constants/theme'

export default function EditBoardScreen() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>()
  const { boards, updateBoard, removeBoard } = useBoardStore(
    useShallow((s) => ({
      boards: s.boards,
      updateBoard: s.updateBoard,
      removeBoard: s.removeBoard,
    })),
  )
  const navigation = useNavigation()

  const editingBoard = boards.find((b) => b.id === boardId)
  const [infoModalVisible, setInfoModalVisible] = useState(false)
  const [batteryModalVisible, setBatteryModalVisible] = useState(false)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const [removeSaving, setRemoveSaving] = useState(false)
  const form = useEditBoardForm({
    board: editingBoard,
    updateBoard,
  })

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setInfoModalVisible(true)}
          style={styles.headerAction}
          hitSlop={8}
          testID="edit-board-header"
        >
          <PencilSimpleIcon size={20} color={theme.neutral.textSecondary} weight="duotone" />
        </Pressable>
      ),
    })
  }, [navigation])

  const handleRemoveBoard = useCallback(async () => {
    if (!editingBoard) return
    setRemoveSaving(true)
    try {
      await removeBoard(editingBoard.id)
      setRemoveConfirmVisible(false)
      router.dismissAll()
    } finally {
      setRemoveSaving(false)
    }
  }, [editingBoard, removeBoard])

  // Link a device: scan, then probe and save the Board Link.
  const handleLink = () => {
    router.push({
      pathname: routes.addBoardScan,
      params: { boardId },
    })
  }

  // Re-link the board: re-probe its existing peripheral and replace the link.
  const handleRelink = () => {
    router.push({
      pathname: routes.editBoardLink,
      params: { boardId },
    })
  }

  if (!editingBoard) return null

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <EditBoardSettings
            name={form.name}
            description={form.description}
            link={editingBoard.link}
            linkSaving={form.saving === 'link'}
            keepMissingBatteryConfig={form.keepMissingBatteryConfig}
            batterySummary={form.batterySummary}
            onOpenBattery={() => setBatteryModalVisible(true)}
            onLink={handleLink}
            onRelink={handleRelink}
            onUnlink={form.unlink}
            onRemove={() => setRemoveConfirmVisible(true)}
          />
        </ScrollView>
      </SafeAreaView>

      <BoardInfoEditorModal
        visible={infoModalVisible}
        name={form.name}
        description={form.description}
        saving={form.saving === 'info'}
        onSave={async (value) => {
          await form.saveInfo(value)
          setInfoModalVisible(false)
        }}
        onCancel={() => setInfoModalVisible(false)}
      />
      <BoardBatteryEditorModal
        visible={batteryModalVisible}
        batteryMode={form.battery.batteryMode}
        cellPresetId={form.battery.cellPresetId}
        seriesCount={form.battery.seriesCount}
        parallelCount={form.battery.parallelCount}
        manualMinVoltage={form.battery.manualMinVoltage}
        manualMaxVoltage={form.battery.manualMaxVoltage}
        saving={form.saving === 'battery'}
        onSave={async (value) => {
          if (await form.saveBattery(value)) setBatteryModalVisible(false)
        }}
        onCancel={() => setBatteryModalVisible(false)}
      />
      <ConfirmModal
        visible={removeConfirmVisible}
        title="Remove board"
        message={`Remove "${editingBoard.name}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        loading={removeSaving}
        onConfirm={handleRemoveBoard}
        onCancel={() => setRemoveConfirmVisible(false)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  headerAction: {
    marginRight: 4,
  },
})

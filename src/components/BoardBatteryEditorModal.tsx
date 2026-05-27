import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { BatteryConfig } from 'vesc-ble'

import { BoardBatteryForm } from '@/components/BoardBatteryForm'
import { Button } from '@/components/Button'

type BatteryMode = BatteryConfig['mode']

interface BoardBatteryEditorModalProps {
  visible: boolean
  batteryMode: BatteryMode
  cellPresetId: string
  seriesCount: number
  parallelCount: number
  manualMinVoltage: string
  manualMaxVoltage: string
  onSave: (value: {
    batteryMode: BatteryMode
    cellPresetId: string
    seriesCount: number
    parallelCount: number
    manualMinVoltage: string
    manualMaxVoltage: string
  }) => void
  onCancel: () => void
}

export function BoardBatteryEditorModal({
  visible,
  batteryMode,
  cellPresetId,
  seriesCount,
  parallelCount,
  manualMinVoltage,
  manualMaxVoltage,
  onSave,
  onCancel,
}: BoardBatteryEditorModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        {visible ? (
          <BoardBatteryEditorModalContent
            batteryMode={batteryMode}
            cellPresetId={cellPresetId}
            seriesCount={seriesCount}
            parallelCount={parallelCount}
            manualMinVoltage={manualMinVoltage}
            manualMaxVoltage={manualMaxVoltage}
            onSave={onSave}
          />
        ) : null}
      </View>
    </Modal>
  )
}

function BoardBatteryEditorModalContent({
  batteryMode,
  cellPresetId,
  seriesCount,
  parallelCount,
  manualMinVoltage,
  manualMaxVoltage,
  onSave,
}: Omit<BoardBatteryEditorModalProps, 'visible' | 'onCancel'>) {
  const [draftBatteryMode, setDraftBatteryMode] = useState(batteryMode)
  const [draftCellPresetId, setDraftCellPresetId] = useState(cellPresetId)
  const [draftSeriesCount, setDraftSeriesCount] = useState(seriesCount)
  const [draftParallelCount, setDraftParallelCount] = useState(parallelCount)
  const [draftManualMinVoltage, setDraftManualMinVoltage] = useState(manualMinVoltage)
  const [draftManualMaxVoltage, setDraftManualMaxVoltage] = useState(manualMaxVoltage)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Battery</Text>
      <BoardBatteryForm
        batteryMode={draftBatteryMode}
        cellPresetId={draftCellPresetId}
        seriesCount={draftSeriesCount}
        parallelCount={draftParallelCount}
        manualMinVoltage={draftManualMinVoltage}
        manualMaxVoltage={draftManualMaxVoltage}
        onChangeBatteryMode={setDraftBatteryMode}
        onChangeCellPresetId={setDraftCellPresetId}
        onChangeSeriesCount={setDraftSeriesCount}
        onChangeParallelCount={setDraftParallelCount}
        onChangeManualMinVoltage={setDraftManualMinVoltage}
        onChangeManualMaxVoltage={setDraftManualMaxVoltage}
      />
      <Button
        label="Save"
        onPress={() =>
          onSave({
            batteryMode: draftBatteryMode,
            cellPresetId: draftCellPresetId,
            seriesCount: draftSeriesCount,
            parallelCount: draftParallelCount,
            manualMinVoltage: draftManualMinVoltage,
            manualMaxVoltage: draftManualMaxVoltage,
          })
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#131c2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '800',
  },
})

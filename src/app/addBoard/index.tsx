import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import type { BatteryConfig } from 'vesc-ble'

import { AddBoardWizard } from '@/components/domain/board/AddBoardWizard'
import {
  type BatteryMode,
  buildBatteryConfig,
  getBatterySummary,
  parseVoltage,
} from '@/lib/boardSetup'
import { DEFAULT_BATTERY_CONFIG, deriveBatteryConfig } from '@/lib/battery'
import { routes } from '@/navigation/routes'
import { useBoardStore } from '@/store/boardStore'
import { theme } from '@/constants/theme'

export default function AddBoardScreen() {
  const { bleId, bleName, step } = useLocalSearchParams<{
    bleId?: string
    bleName?: string
    step?: string
  }>()
  const addBoard = useBoardStore(useShallow((s) => s.addBoard))

  const pairedBleId = bleId ?? ''
  const pairedBleName = bleName ?? ''

  const [name, setName] = useState(bleName ?? '')
  const [description, setDescription] = useState('')
  const [batteryMode, setBatteryMode] = useState<BatteryMode>(DEFAULT_BATTERY_CONFIG.mode)
  const [cellPresetId, setCellPresetId] = useState(DEFAULT_BATTERY_CONFIG.cellPresetId)
  const [seriesCount, setSeriesCount] = useState(DEFAULT_BATTERY_CONFIG.seriesCount)
  const [parallelCount, setParallelCount] = useState(DEFAULT_BATTERY_CONFIG.parallelCount)
  const [manualMinVoltage, setManualMinVoltage] = useState('60')
  const [manualMaxVoltage, setManualMaxVoltage] = useState('84')

  const [wizardStep, setWizardStep] = useState(() => {
    const parsed = step == null ? NaN : Number.parseInt(step, 10)
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(3, parsed))
    return bleId ? 1 : 0
  })
  const activeWizardStep = bleId ? Math.max(wizardStep, 1) : wizardStep

  const previewConfig: BatteryConfig =
    batteryMode === 'preset'
      ? { mode: 'preset', cellPresetId, seriesCount, parallelCount }
      : {
          mode: 'manual',
          minVoltage: parseVoltage(manualMinVoltage) ?? 0,
          maxVoltage: parseVoltage(manualMaxVoltage) ?? 0,
        }
  const derivedBattery = deriveBatteryConfig(previewConfig)
  const canSave = Boolean(name.trim()) && derivedBattery.warning == null
  const batterySummary = getBatterySummary(
    false,
    derivedBattery,
    batteryMode,
    cellPresetId,
    seriesCount,
    parallelCount,
  )

  const handleSave = () => {
    if (!canSave) return
    const batteryConfig = buildBatteryConfig(
      batteryMode,
      cellPresetId,
      seriesCount,
      parallelCount,
      manualMinVoltage,
      manualMaxVoltage,
    )
    addBoard({
      name: name.trim(),
      description: description.trim() || undefined,
      bleId: pairedBleId.trim() || undefined,
      batteryConfig,
    })
    router.dismissAll()
  }

  const handleOpenPairing = () => {
    router.push({
      pathname: routes.addBoardScan,
      params: { step: '1' },
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AddBoardWizard
            step={activeWizardStep}
            name={name}
            description={description}
            pairedBleId={pairedBleId}
            pairedBleName={pairedBleName}
            batteryMode={batteryMode}
            cellPresetId={cellPresetId}
            seriesCount={seriesCount}
            parallelCount={parallelCount}
            manualMinVoltage={manualMinVoltage}
            manualMaxVoltage={manualMaxVoltage}
            batterySummary={batterySummary}
            batteryWarning={derivedBattery.warning}
            canSave={canSave}
            onStepChange={setWizardStep}
            onOpenPairing={handleOpenPairing}
            onChangeName={setName}
            onChangeDescription={setDescription}
            onChangeBatteryMode={setBatteryMode}
            onChangeCellPresetId={setCellPresetId}
            onChangeSeriesCount={setSeriesCount}
            onChangeParallelCount={setParallelCount}
            onChangeManualMinVoltage={setManualMinVoltage}
            onChangeManualMaxVoltage={setManualMaxVoltage}
            onSave={handleSave}
          />
        </ScrollView>
      </SafeAreaView>
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
    gap: 10,
  },
})

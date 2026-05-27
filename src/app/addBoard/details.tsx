import { type ReactNode, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import {
  BatteryChargingIcon,
  BluetoothIcon,
  IdentificationCardIcon,
  TrashIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'
import type { BatteryConfig } from 'vesc-ble'

import { BoardBatteryEditorModal } from '@/components/BoardBatteryEditorModal'
import { BoardBatteryForm } from '@/components/BoardBatteryForm'
import { BoardInfoEditorModal } from '@/components/BoardInfoEditorModal'
import { BoardInfoForm } from '@/components/BoardInfoForm'
import { BoardSettingRow } from '@/components/BoardSettingRow'
import { Button } from '@/components/Button'
import { ConfirmModal } from '@/components/ConfirmModal'
import { IconButton } from '@/components/IconButton'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { theme } from '@/constants/theme'
import {
  BATTERY_CELL_PRESETS,
  DEFAULT_BATTERY_CONFIG,
  deriveBatteryConfig,
} from '@/helpers/battery'
import { routes } from '@/navigation/routes'
import { useBoardStore } from '@/store/boardStore'

type BatteryMode = BatteryConfig['mode']

// eslint-disable-next-line complexity
export default function BoardDetailsScreen() {
  const { bleId, bleName, boardId, step } = useLocalSearchParams<{
    bleId?: string
    bleName?: string
    boardId?: string
    step?: string
  }>()
  const { boards, addBoard, updateBoard, removeBoard } = useBoardStore(
    useShallow((s) => ({
      boards: s.boards,
      addBoard: s.addBoard,
      updateBoard: s.updateBoard,
      removeBoard: s.removeBoard,
    })),
  )
  const navigation = useNavigation()

  const editingBoard = boardId ? boards.find((b) => b.id === boardId) : undefined

  const [name, setName] = useState(editingBoard?.name ?? bleName ?? '')
  const [description, setDescription] = useState(editingBoard?.description ?? '')
  const [pairedBleId, setPairedBleId] = useState(editingBoard?.bleId ?? bleId ?? '')
  const [pairedBleName, setPairedBleName] = useState(bleName ?? '')
  const initialBatteryConfig = editingBoard?.batteryConfig ?? DEFAULT_BATTERY_CONFIG
  const initialMode = initialBatteryConfig.mode
  const initialPreset =
    initialBatteryConfig.mode === 'preset' ? initialBatteryConfig : DEFAULT_BATTERY_CONFIG
  const initialManual =
    initialBatteryConfig.mode === 'manual'
      ? initialBatteryConfig
      : { mode: 'manual' as const, minVoltage: 60, maxVoltage: 84 }
  const [batteryMode, setBatteryMode] = useState<BatteryMode>(initialMode)
  const [cellPresetId, setCellPresetId] = useState(initialPreset.cellPresetId)
  const [seriesCount, setSeriesCount] = useState(initialPreset.seriesCount)
  const [parallelCount, setParallelCount] = useState(initialPreset.parallelCount)
  const [manualMinVoltage, setManualMinVoltage] = useState(String(initialManual.minVoltage))
  const [manualMaxVoltage, setManualMaxVoltage] = useState(String(initialManual.maxVoltage))
  const [batteryTouched, setBatteryTouched] = useState(false)
  const [infoModalVisible, setInfoModalVisible] = useState(false)
  const [batteryModalVisible, setBatteryModalVisible] = useState(false)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const [wizardStep, setWizardStep] = useState(() => {
    const parsed = step == null ? NaN : Number.parseInt(step, 10)
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(3, parsed))
    return bleId ? 1 : 0
  })
  const activeWizardStep = !editingBoard && bleId ? Math.max(wizardStep, 1) : wizardStep

  const previewConfig: BatteryConfig =
    batteryMode === 'preset'
      ? { mode: 'preset', cellPresetId, seriesCount, parallelCount }
      : {
          mode: 'manual',
          minVoltage: parseVoltage(manualMinVoltage) ?? 0,
          maxVoltage: parseVoltage(manualMaxVoltage) ?? 0,
        }
  const derivedBattery = deriveBatteryConfig(previewConfig)
  const keepMissingBatteryConfig = Boolean(
    editingBoard && editingBoard.batteryConfig == null && !batteryTouched,
  )
  const canSave =
    Boolean(name.trim()) && (keepMissingBatteryConfig || derivedBattery.warning == null)
  const batterySummary = getBatterySummary(
    keepMissingBatteryConfig,
    derivedBattery,
    batteryMode,
    cellPresetId,
    seriesCount,
    parallelCount,
  )

  useEffect(() => {
    navigation.setOptions({ title: editingBoard ? 'Edit Board' : 'Add Board' })
  }, [editingBoard, navigation])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: editingBoard
        ? () => (
            <IconButton
              icon={TrashIcon}
              destructive
              onPress={() => setRemoveConfirmVisible(true)}
              style={styles.headerAction}
            />
          )
        : undefined,
    })
  }, [editingBoard, navigation])

  const handleSave = () => {
    if (!canSave) return
    const batteryConfig = keepMissingBatteryConfig
      ? null
      : buildBatteryConfig(
          batteryMode,
          cellPresetId,
          seriesCount,
          parallelCount,
          manualMinVoltage,
          manualMaxVoltage,
        )
    if (editingBoard) {
      void updateBoard({
        ...editingBoard,
        name: name.trim(),
        description: description.trim() || null,
        bleId: pairedBleId.trim() || null,
        batteryConfig,
      })
    } else {
      addBoard({
        name: name.trim(),
        description: description.trim() || undefined,
        bleId: pairedBleId.trim() || undefined,
        batteryConfig,
      })
    }
    router.dismissAll()
  }

  const handleOpenPairing = () => {
    router.push({
      pathname: routes.addBoardScan,
      params: editingBoard ? { boardId: editingBoard.id } : { step: '1' },
    })
  }

  const handleRemoveBoard = useCallback(() => {
    if (!editingBoard) return
    void removeBoard(editingBoard.id)
    setRemoveConfirmVisible(false)
    router.dismissAll()
  }, [editingBoard, removeBoard])

  const saveEditingBoard = useCallback(
    (patch: {
      name?: string
      description?: string | null
      batteryConfig?: BatteryConfig | null
      bleId?: string | null
    }) => {
      if (!editingBoard) return
      void updateBoard({ ...editingBoard, ...patch })
    },
    [editingBoard, updateBoard],
  )

  useEffect(() => {
    if (!bleId || !editingBoard) return
    if (editingBoard.bleId === bleId) return
    saveEditingBoard({ bleId })
  }, [bleId, editingBoard, saveEditingBoard])

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {editingBoard ? (
            <EditBoardSettings
              name={name}
              description={description}
              pairedBleId={pairedBleId}
              pairedBleName={pairedBleName}
              keepMissingBatteryConfig={keepMissingBatteryConfig}
              batterySummary={batterySummary}
              onOpenInfo={() => setInfoModalVisible(true)}
              onOpenBattery={() => setBatteryModalVisible(true)}
              onOpenPairing={handleOpenPairing}
              onClearPairing={() => {
                setPairedBleId('')
                setPairedBleName('')
                saveEditingBoard({ bleId: null })
              }}
            />
          ) : (
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
              onChangeBatteryMode={(value) => {
                setBatteryTouched(true)
                setBatteryMode(value)
              }}
              onChangeCellPresetId={(value) => {
                setBatteryTouched(true)
                setCellPresetId(value)
              }}
              onChangeSeriesCount={(value) => {
                setBatteryTouched(true)
                setSeriesCount(value)
              }}
              onChangeParallelCount={(value) => {
                setBatteryTouched(true)
                setParallelCount(value)
              }}
              onChangeManualMinVoltage={(value) => {
                setBatteryTouched(true)
                setManualMinVoltage(value)
              }}
              onChangeManualMaxVoltage={(value) => {
                setBatteryTouched(true)
                setManualMaxVoltage(value)
              }}
              onSave={handleSave}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      <BoardInfoEditorModal
        visible={infoModalVisible}
        name={name}
        description={description}
        onSave={(value) => {
          setName(value.name)
          setDescription(value.description)
          saveEditingBoard({
            name: value.name.trim(),
            description: value.description.trim() || null,
          })
          setInfoModalVisible(false)
        }}
        onCancel={() => setInfoModalVisible(false)}
      />
      <BoardBatteryEditorModal
        visible={batteryModalVisible}
        batteryMode={batteryMode}
        cellPresetId={cellPresetId}
        seriesCount={seriesCount}
        parallelCount={parallelCount}
        manualMinVoltage={manualMinVoltage}
        manualMaxVoltage={manualMaxVoltage}
        onSave={(value) => {
          setBatteryMode(value.batteryMode)
          setCellPresetId(value.cellPresetId)
          setSeriesCount(value.seriesCount)
          setParallelCount(value.parallelCount)
          setManualMinVoltage(value.manualMinVoltage)
          setManualMaxVoltage(value.manualMaxVoltage)
          setBatteryTouched(true)
          saveEditingBoard({
            batteryConfig: buildBatteryConfig(
              value.batteryMode,
              value.cellPresetId,
              value.seriesCount,
              value.parallelCount,
              value.manualMinVoltage,
              value.manualMaxVoltage,
            ),
          })
          setBatteryModalVisible(false)
        }}
        onCancel={() => setBatteryModalVisible(false)}
      />
      <ConfirmModal
        visible={removeConfirmVisible}
        title="Remove board"
        message={`Remove "${editingBoard?.name ?? 'board'}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemoveBoard}
        onCancel={() => setRemoveConfirmVisible(false)}
      />
    </KeyboardAvoidingView>
  )
}

type BatterySummary = ReturnType<typeof getBatterySummary>

function EditBoardSettings({
  name,
  description,
  pairedBleId,
  pairedBleName,
  keepMissingBatteryConfig,
  batterySummary,
  onOpenInfo,
  onOpenBattery,
  onOpenPairing,
  onClearPairing,
}: {
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  keepMissingBatteryConfig: boolean
  batterySummary: BatterySummary
  onOpenInfo: () => void
  onOpenBattery: () => void
  onOpenPairing: () => void
  onClearPairing: () => void
}) {
  return (
    <>
      <SettingsSectionTitle>Board</SettingsSectionTitle>
      <SettingsCard>
        <BoardSettingRow
          icon={IdentificationCardIcon}
          iconColor={theme.wheel.text}
          label={name.trim() || 'Unnamed board'}
          value={description.trim() || 'No description'}
          hint="Name and notes"
          onPress={onOpenInfo}
        />
      </SettingsCard>

      <SettingsSectionTitle>Battery</SettingsSectionTitle>
      <SettingsCard>
        <BoardSettingRow
          icon={BatteryChargingIcon}
          iconColor={theme.highlight.text}
          label={keepMissingBatteryConfig ? 'Not configured' : batterySummary.title}
          value={batterySummary.value}
          hint={batterySummary.hint}
          onPress={onOpenBattery}
        />
      </SettingsCard>

      <View style={styles.pairing}>
        <View style={styles.pairingCopy}>
          <View style={styles.pairingTitleRow}>
            <BluetoothIcon size={14} color={theme.teal.text} weight="duotone" />
            <Text style={styles.pairingTitle}>BLE pairing</Text>
          </View>
          <Text style={styles.pairingValue} numberOfLines={1}>
            {pairedBleId ? pairedBleName || pairedBleId : 'No device paired'}
          </Text>
        </View>
        <Button
          label={pairedBleId ? 'Change' : 'Pair'}
          variant="secondary"
          size="sm"
          onPress={onOpenPairing}
        />
        {pairedBleId ? (
          <Button label="Clear" variant="secondary" size="sm" onPress={onClearPairing} />
        ) : null}
      </View>
    </>
  )
}

function AddBoardWizard({
  step,
  name,
  description,
  pairedBleId,
  pairedBleName,
  batteryMode,
  cellPresetId,
  seriesCount,
  parallelCount,
  manualMinVoltage,
  manualMaxVoltage,
  batterySummary,
  batteryWarning,
  canSave,
  onStepChange,
  onOpenPairing,
  onChangeName,
  onChangeDescription,
  onChangeBatteryMode,
  onChangeCellPresetId,
  onChangeSeriesCount,
  onChangeParallelCount,
  onChangeManualMinVoltage,
  onChangeManualMaxVoltage,
  onSave,
}: {
  step: number
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  batteryMode: BatteryMode
  cellPresetId: string
  seriesCount: number
  parallelCount: number
  manualMinVoltage: string
  manualMaxVoltage: string
  batterySummary: BatterySummary
  batteryWarning: string | null
  canSave: boolean
  onStepChange: (step: number) => void
  onOpenPairing: () => void
  onChangeName: (value: string) => void
  onChangeDescription: (value: string) => void
  onChangeBatteryMode: (value: BatteryMode) => void
  onChangeCellPresetId: (value: string) => void
  onChangeSeriesCount: (value: number) => void
  onChangeParallelCount: (value: number) => void
  onChangeManualMinVoltage: (value: string) => void
  onChangeManualMaxVoltage: (value: string) => void
  onSave: () => void
}) {
  return (
    <>
      <WizardHeader step={step} />
      {step === 0 ? (
        <PairWizardStep
          pairedBleId={pairedBleId}
          pairedBleName={pairedBleName}
          onOpenPairing={onOpenPairing}
          onNext={() => onStepChange(1)}
        />
      ) : null}
      {step === 1 ? (
        <NameWizardStep
          name={name}
          description={description}
          onChangeName={onChangeName}
          onChangeDescription={onChangeDescription}
          onBack={() => onStepChange(0)}
          onNext={() => onStepChange(2)}
        />
      ) : null}
      {step === 2 ? (
        <BatteryWizardStep
          batteryMode={batteryMode}
          cellPresetId={cellPresetId}
          seriesCount={seriesCount}
          parallelCount={parallelCount}
          manualMinVoltage={manualMinVoltage}
          manualMaxVoltage={manualMaxVoltage}
          batteryWarning={batteryWarning}
          onChangeBatteryMode={onChangeBatteryMode}
          onChangeCellPresetId={onChangeCellPresetId}
          onChangeSeriesCount={onChangeSeriesCount}
          onChangeParallelCount={onChangeParallelCount}
          onChangeManualMinVoltage={onChangeManualMinVoltage}
          onChangeManualMaxVoltage={onChangeManualMaxVoltage}
          onBack={() => onStepChange(1)}
          onNext={() => onStepChange(3)}
        />
      ) : null}
      {step === 3 ? (
        <OverviewWizardStep
          name={name}
          description={description}
          pairedBleId={pairedBleId}
          pairedBleName={pairedBleName}
          batterySummary={batterySummary}
          canSave={canSave}
          onBack={() => onStepChange(2)}
          onSave={onSave}
        />
      ) : null}
    </>
  )
}

function PairWizardStep({
  pairedBleId,
  pairedBleName,
  onOpenPairing,
  onNext,
}: {
  pairedBleId: string
  pairedBleName: string
  onOpenPairing: () => void
  onNext: () => void
}) {
  return (
    <WizardStep title="Pair board">
      <Text style={styles.wizardCopy}>
        {pairedBleId
          ? `Paired with ${pairedBleName || pairedBleId}`
          : 'Pair now or skip and pair later.'}
      </Text>
      <View style={styles.actionRow}>
        <Button
          style={styles.actionButton}
          label={pairedBleId ? 'Change Pairing' : 'Pair'}
          onPress={onOpenPairing}
        />
        <Button style={styles.actionButton} label="Next" variant="secondary" onPress={onNext} />
      </View>
    </WizardStep>
  )
}

function NameWizardStep({
  name,
  description,
  onChangeName,
  onChangeDescription,
  onBack,
  onNext,
}: {
  name: string
  description: string
  onChangeName: (value: string) => void
  onChangeDescription: (value: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <WizardStep title="Name">
      <BoardInfoForm
        name={name}
        description={description}
        onChangeName={onChangeName}
        onChangeDescription={onChangeDescription}
      />
      <WizardActions canContinue={Boolean(name.trim())} onBack={onBack} onNext={onNext} />
    </WizardStep>
  )
}

function BatteryWizardStep({
  batteryMode,
  cellPresetId,
  seriesCount,
  parallelCount,
  manualMinVoltage,
  manualMaxVoltage,
  batteryWarning,
  onChangeBatteryMode,
  onChangeCellPresetId,
  onChangeSeriesCount,
  onChangeParallelCount,
  onChangeManualMinVoltage,
  onChangeManualMaxVoltage,
  onBack,
  onNext,
}: {
  batteryMode: BatteryMode
  cellPresetId: string
  seriesCount: number
  parallelCount: number
  manualMinVoltage: string
  manualMaxVoltage: string
  batteryWarning: string | null
  onChangeBatteryMode: (value: BatteryMode) => void
  onChangeCellPresetId: (value: string) => void
  onChangeSeriesCount: (value: number) => void
  onChangeParallelCount: (value: number) => void
  onChangeManualMinVoltage: (value: string) => void
  onChangeManualMaxVoltage: (value: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <WizardStep title="Battery">
      <BoardBatteryForm
        batteryMode={batteryMode}
        cellPresetId={cellPresetId}
        seriesCount={seriesCount}
        parallelCount={parallelCount}
        manualMinVoltage={manualMinVoltage}
        manualMaxVoltage={manualMaxVoltage}
        onChangeBatteryMode={onChangeBatteryMode}
        onChangeCellPresetId={onChangeCellPresetId}
        onChangeSeriesCount={onChangeSeriesCount}
        onChangeParallelCount={onChangeParallelCount}
        onChangeManualMinVoltage={onChangeManualMinVoltage}
        onChangeManualMaxVoltage={onChangeManualMaxVoltage}
      />
      <WizardActions canContinue={batteryWarning == null} onBack={onBack} onNext={onNext} />
    </WizardStep>
  )
}

function OverviewWizardStep({
  name,
  description,
  pairedBleId,
  pairedBleName,
  batterySummary,
  canSave,
  onBack,
  onSave,
}: {
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  batterySummary: BatterySummary
  canSave: boolean
  onBack: () => void
  onSave: () => void
}) {
  return (
    <WizardStep title="Overview">
      <OverviewRow
        label="Pairing"
        value={pairedBleId ? pairedBleName || pairedBleId : 'Not paired'}
      />
      <OverviewRow label="Name" value={name.trim() || 'Unnamed board'} />
      <OverviewRow label="Description" value={description.trim() || 'No description'} />
      <OverviewRow label="Battery" value={`${batterySummary.title} · ${batterySummary.value}`} />
      <View style={styles.actionRow}>
        <Button style={styles.actionButton} label="Back" variant="secondary" onPress={onBack} />
        <Button
          style={styles.actionButton}
          label="Save & Go Back"
          onPress={onSave}
          disabled={!canSave}
        />
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#111827',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  headerAction: {
    marginRight: 4,
  },
  pairing: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pairingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pairingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pairingTitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pairingValue: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  wizardHeader: {
    gap: 8,
    marginBottom: 8,
  },
  wizardProgress: {
    flexDirection: 'row',
    gap: 6,
  },
  wizardDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
  },
  wizardDotActive: {
    backgroundColor: theme.bran.color,
  },
  wizardMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  wizardStep: {
    gap: 14,
  },
  wizardTitle: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '800',
  },
  wizardCopy: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  overviewRow: {
    gap: 2,
  },
  overviewLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  overviewValue: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
  },
})

function WizardHeader({ step }: { step: number }) {
  return (
    <View style={styles.wizardHeader}>
      <View style={styles.wizardProgress}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={[styles.wizardDot, index <= step && styles.wizardDotActive]} />
        ))}
      </View>
      <Text style={styles.wizardMeta}>Step {step + 1} of 4</Text>
    </View>
  )
}

function WizardStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.wizardStep}>
      <Text style={styles.wizardTitle}>{title}</Text>
      {children}
    </View>
  )
}

function WizardActions({
  canContinue,
  onBack,
  onNext,
}: {
  canContinue: boolean
  onBack: () => void
  onNext: () => void
}) {
  return (
    <View style={styles.actionRow}>
      <Button style={styles.actionButton} label="Back" variant="secondary" onPress={onBack} />
      <Button style={styles.actionButton} label="Next" onPress={onNext} disabled={!canContinue} />
    </View>
  )
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.overviewRow}>
      <Text style={styles.overviewLabel}>{label}</Text>
      <Text style={styles.overviewValue}>{value}</Text>
    </View>
  )
}

function parseVoltage(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function buildBatteryConfig(
  mode: BatteryMode,
  cellPresetId: string,
  seriesCount: number,
  parallelCount: number,
  manualMinVoltage: string,
  manualMaxVoltage: string,
): BatteryConfig | null {
  if (mode === 'preset') {
    return {
      mode: 'preset',
      cellPresetId,
      seriesCount,
      parallelCount,
    }
  }
  const minVoltage = parseVoltage(manualMinVoltage)
  const maxVoltage = parseVoltage(manualMaxVoltage)
  if (minVoltage == null || maxVoltage == null || maxVoltage <= minVoltage) return null
  return { mode: 'manual', minVoltage, maxVoltage }
}

function getBatterySummary(
  keepMissingBatteryConfig: boolean,
  derivedBattery: ReturnType<typeof deriveBatteryConfig>,
  batteryMode: BatteryMode,
  cellPresetId: string,
  seriesCount: number,
  parallelCount: number,
) {
  if (keepMissingBatteryConfig) {
    return {
      title: 'Battery',
      value: 'Tap to add battery config',
      hint: 'Used for voltage and SoC display',
    }
  }
  if (derivedBattery.warning) {
    return {
      title: 'Incomplete config',
      value: derivedBattery.warning,
      hint: 'Tap to fix battery config',
    }
  }
  const voltage = `${derivedBattery.minVoltage.toFixed(1)}-${derivedBattery.maxVoltage.toFixed(1)} V`
  const nominalWh =
    derivedBattery.nominalWh != null ? `${Math.round(derivedBattery.nominalWh)} Wh nominal` : null
  if (batteryMode === 'manual') {
    return {
      title: 'Manual voltage range',
      value: voltage,
      hint: nominalWh ?? 'Manual pack voltage',
    }
  }
  const preset = BATTERY_CELL_PRESETS.find((candidate) => candidate.id === cellPresetId)
  return {
    title: preset ? `${preset.brand} ${preset.model}` : 'Cell preset',
    value: `${seriesCount}s${parallelCount}p, ${voltage}`,
    hint: nominalWh ?? 'Preset pack config',
  }
}

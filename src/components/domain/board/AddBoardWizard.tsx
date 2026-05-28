import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { BoardBatteryForm } from '@/components/domain/board/BoardBatteryForm'
import { BoardInfoForm } from '@/components/domain/board/BoardInfoForm'
import { Button } from '@/components/ui/base/Button'
import { theme } from '@/constants/theme'
import type { BatteryMode, BatterySummary } from '@/lib/boardSetup'

interface AddBoardWizardProps {
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
}

export function AddBoardWizard({
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
}: AddBoardWizardProps) {
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

// ── Internal sub-components ──

interface PairWizardStepProps {
  pairedBleId: string
  pairedBleName: string
  onOpenPairing: () => void
  onNext: () => void
}

function PairWizardStep({
  pairedBleId,
  pairedBleName,
  onOpenPairing,
  onNext,
}: PairWizardStepProps) {
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

interface NameWizardStepProps {
  name: string
  description: string
  onChangeName: (value: string) => void
  onChangeDescription: (value: string) => void
  onBack: () => void
  onNext: () => void
}

function NameWizardStep({
  name,
  description,
  onChangeName,
  onChangeDescription,
  onBack,
  onNext,
}: NameWizardStepProps) {
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

interface BatteryWizardStepProps {
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
}: BatteryWizardStepProps) {
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

interface OverviewWizardStepProps {
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  batterySummary: BatterySummary
  canSave: boolean
  onBack: () => void
  onSave: () => void
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
}: OverviewWizardStepProps) {
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

interface WizardHeaderProps {
  step: number
}

function WizardHeader({ step }: WizardHeaderProps) {
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

interface WizardStepProps {
  title: string
  children: ReactNode
}

function WizardStep({ title, children }: WizardStepProps) {
  return (
    <View style={styles.wizardStep}>
      <Text style={styles.wizardTitle}>{title}</Text>
      {children}
    </View>
  )
}

interface WizardActionsProps {
  canContinue: boolean
  onBack: () => void
  onNext: () => void
}

function WizardActions({ canContinue, onBack, onNext }: WizardActionsProps) {
  return (
    <View style={styles.actionRow}>
      <Button style={styles.actionButton} label="Back" variant="secondary" onPress={onBack} />
      <Button style={styles.actionButton} label="Next" onPress={onNext} disabled={!canContinue} />
    </View>
  )
}

interface OverviewRowProps {
  label: string
  value: string
}

function OverviewRow({ label, value }: OverviewRowProps) {
  return (
    <View style={styles.overviewRow}>
      <Text style={styles.overviewLabel}>{label}</Text>
      <Text style={styles.overviewValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: theme.neutral.border,
  },
  wizardDotActive: {
    backgroundColor: theme.bran.color,
  },
  wizardMeta: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  wizardStep: {
    gap: 14,
  },
  wizardTitle: {
    color: theme.neutral.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  wizardCopy: {
    color: theme.neutral.textSecondary,
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
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  overviewValue: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
})

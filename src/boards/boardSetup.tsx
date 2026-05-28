import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BatteryChargingIcon, BluetoothIcon, IdentificationCardIcon } from 'phosphor-react-native'
import type { BatteryConfig } from 'vesc-ble'

import { BoardBatteryForm } from '@/components/BoardBatteryForm'
import { BoardInfoForm } from '@/components/BoardInfoForm'
import { BoardSettingRow } from '@/components/BoardSettingRow'
import { Button } from '@/components/Button'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { theme } from '@/constants/theme'
import { BATTERY_CELL_PRESETS, deriveBatteryConfig } from '@/lib/battery'

export type BatteryMode = BatteryConfig['mode']
type BatterySummary = ReturnType<typeof getBatterySummary>

interface EditBoardSettingsProps {
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  pairingSaving?: boolean
  keepMissingBatteryConfig: boolean
  batterySummary: BatterySummary
  onOpenInfo: () => void
  onOpenBattery: () => void
  onOpenPairing: () => void
  onClearPairing: () => Promise<void> | void
}

export function EditBoardSettings({
  name,
  description,
  pairedBleId,
  pairedBleName,
  pairingSaving = false,
  keepMissingBatteryConfig,
  batterySummary,
  onOpenInfo,
  onOpenBattery,
  onOpenPairing,
  onClearPairing,
}: EditBoardSettingsProps) {
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
          loading={pairingSaving}
          onPress={onOpenPairing}
        />
        {pairedBleId ? (
          <Button
            label="Clear"
            variant="secondary"
            size="sm"
            loading={pairingSaving}
            onPress={onClearPairing}
          />
        ) : null}
      </View>
    </>
  )
}

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

export function parseVoltage(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildBatteryConfig(
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

export function getBatterySummary(
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

export const boardSetupStyles = StyleSheet.create({
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
})

const styles = StyleSheet.create({
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

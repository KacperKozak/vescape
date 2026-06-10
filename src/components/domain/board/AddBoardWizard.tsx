import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Bluetooth,
  TextT,
  BatteryFull,
  CheckCircle,
  WifiHigh,
  WifiLow,
  WifiSlash,
  CaretDown,
  CaretRight,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { BoardBatteryForm } from '@/components/domain/board/BoardBatteryForm'
import { BoardInfoForm } from '@/components/domain/board/BoardInfoForm'
import { Button } from '@/components/ui/base/Button'
import { DeviceRow } from '@/components/ui/base/DeviceRow'
import { theme } from '@/constants/theme'
import { type UseAddBoardWizard, WIZARD_STEPS, type WizardStepId } from '@/hooks/useAddBoardWizard'
import { useBleStore, NUS_SERVICE_UUID } from '@/store/bleStore'
import { usePermissions } from '@/hooks/usePermissions'

const STEP_META: Record<WizardStepId, { label: string; icon: typeof Bluetooth; color: string }> = {
  scan: { label: 'Pair', icon: Bluetooth, color: theme.wheel.color },
  name: { label: 'Name', icon: TextT, color: theme.highlight.color },
  battery: { label: 'Battery', icon: BatteryFull, color: theme.gps.color },
  confirm: { label: 'Confirm', icon: CheckCircle, color: theme.target.color },
}

interface Props {
  wizard: UseAddBoardWizard
}

export function AddBoardWizard({ wizard }: Props) {
  return (
    <>
      <ProgressBar step={wizard.step} />
      {wizard.stepId === 'scan' && <ScanStep wizard={wizard} />}
      {wizard.stepId === 'name' && <NameStep wizard={wizard} />}
      {wizard.stepId === 'battery' && <BatteryStep wizard={wizard} />}
      {wizard.stepId === 'confirm' && <ConfirmStep wizard={wizard} />}
    </>
  )
}

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        {WIZARD_STEPS.map((id, index) => (
          <View
            key={id}
            style={[
              styles.progressSegment,
              index <= step ? { backgroundColor: STEP_META[id].color } : undefined,
            ]}
          />
        ))}
      </View>
      <View style={styles.progressLabels}>
        {WIZARD_STEPS.map((id, index) => {
          const meta = STEP_META[id]
          const active = index <= step
          return (
            <View key={id} style={styles.progressLabelItem}>
              <meta.icon
                size={12}
                color={active ? meta.color : theme.neutral.textDim}
                weight="bold"
              />
              <Text style={[styles.progressLabel, active && { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ScanStep({ wizard }: Props) {
  const { status, request } = usePermissions()
  const { devices, error, startScan, stopScan, isScanning } = useBleStore(
    useShallow((s) => ({
      devices: s.devices,
      error: s.error,
      startScan: s.startScan,
      stopScan: s.stopScan,
      isScanning: s.scanStatus === 'scanning',
    })),
  )
  const [showOther, setShowOther] = useState(false)

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (status === 'granted') startScan()
    return () => stopScan()
  }, [status, startScan, stopScan])

  const { vescDevices, otherDevices } = useMemo(() => {
    const vesc = []
    const other = []
    for (const d of devices) {
      if (d.serviceUUIDs.some((u) => u.toLowerCase() === NUS_SERVICE_UUID)) {
        vesc.push(d)
      } else {
        other.push(d)
      }
    }
    return { vescDevices: vesc, otherDevices: other }
  }, [devices])

  const SignalIcon = isScanning ? WifiHigh : devices.length > 0 ? WifiLow : WifiSlash

  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <Bluetooth size={20} color={theme.wheel.color} weight="duotone" />
        <Text style={styles.stepTitle}>Pair your board</Text>
        <View style={styles.stepHeaderSpacer} />
        {wizard.bleId ? (
          <Pressable onPress={wizard.next} hitSlop={8} testID="add-board-pair-next">
            <Text style={styles.skipLink}>Next →</Text>
          </Pressable>
        ) : (
          <Pressable onPress={wizard.next} hitSlop={8} testID="add-board-skip-pairing">
            <Text style={styles.skipLink}>Skip</Text>
          </Pressable>
        )}
      </View>

      {wizard.bleId ? (
        <>
          <View style={styles.pairedBanner}>
            <Bluetooth size={16} color={theme.gps.color} weight="duotone" />
            <Text style={styles.pairedText}>Paired with {wizard.bleName || wizard.bleId}</Text>
          </View>
          <Button
            label="Change pairing"
            variant="secondary"
            icon={Bluetooth}
            onPress={wizard.clearDevice}
          />
        </>
      ) : (
        <>
          <View style={styles.scanHeader}>
            {isScanning && <ActivityIndicator color={theme.wheel.color} size="small" />}
            <SignalIcon
              size={14}
              color={isScanning ? theme.wheel.color : theme.neutral.textMuted}
              weight="bold"
            />
            <Text style={styles.scanStatus}>
              {status === 'denied'
                ? 'Bluetooth permission required'
                : error
                  ? error
                  : isScanning
                    ? 'Scanning for nearby boards…'
                    : 'No boards found'}
            </Text>
          </View>
          {vescDevices.map((device) => (
            <DeviceRow
              key={device.id}
              id={device.id}
              name={device.name}
              rssi={device.rssi}
              onPress={() => wizard.selectDevice(device.id, device.name)}
            />
          ))}
          {vescDevices.length === 0 && devices.length === 0 && isScanning && (
            <Text style={styles.emptyHint}>Boards will appear as they are found</Text>
          )}
          {otherDevices.length > 0 && (
            <>
              <Pressable
                style={styles.otherDevicesToggle}
                onPress={() => setShowOther((v) => !v)}
                hitSlop={8}
              >
                {showOther ? (
                  <CaretDown size={12} color={theme.neutral.textMuted} weight="bold" />
                ) : (
                  <CaretRight size={12} color={theme.neutral.textMuted} weight="bold" />
                )}
                <Text style={styles.otherDevicesLabel}>Other devices ({otherDevices.length})</Text>
              </Pressable>
              {showOther &&
                otherDevices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    id={device.id}
                    name={device.name}
                    rssi={device.rssi}
                    onPress={() => wizard.selectDevice(device.id, device.name)}
                  />
                ))}
            </>
          )}
        </>
      )}
    </View>
  )
}

function NameStep({ wizard }: Props) {
  return (
    <StepContainer title="Name your board" icon={TextT} color={theme.highlight.color}>
      <BoardInfoForm
        name={wizard.name}
        description={wizard.description}
        onChangeName={wizard.setName}
        onChangeDescription={wizard.setDescription}
        nameTestID="add-board-name-input"
        descriptionTestID="add-board-description-input"
      />
      <NavActions
        canContinue={Boolean(wizard.name.trim())}
        onBack={wizard.back}
        onNext={wizard.next}
        testIDPrefix="add-board-name"
      />
    </StepContainer>
  )
}

function BatteryStep({ wizard }: Props) {
  return (
    <StepContainer title="Battery config" icon={BatteryFull} color={theme.gps.color}>
      <BoardBatteryForm
        batteryMode={wizard.batteryMode}
        cellPresetId={wizard.cellPresetId}
        seriesCount={wizard.seriesCount}
        parallelCount={wizard.parallelCount}
        manualMinVoltage={wizard.manualMinVoltage}
        manualMaxVoltage={wizard.manualMaxVoltage}
        onChangeBatteryMode={wizard.setBatteryMode}
        onChangeCellPresetId={wizard.setCellPresetId}
        onChangeSeriesCount={wizard.setSeriesCount}
        onChangeParallelCount={wizard.setParallelCount}
        onChangeManualMinVoltage={wizard.setManualMinVoltage}
        onChangeManualMaxVoltage={wizard.setManualMaxVoltage}
      />
      <NavActions
        canContinue={wizard.batteryWarning == null}
        onBack={wizard.back}
        onNext={wizard.next}
        testIDPrefix="add-board-battery"
      />
    </StepContainer>
  )
}

function ConfirmStep({ wizard }: Props) {
  return (
    <StepContainer title="Review & save" icon={CheckCircle} color={theme.target.color}>
      <View style={styles.confirmCard}>
        <ConfirmRow
          icon={Bluetooth}
          iconColor={theme.wheel.color}
          label="Pairing"
          value={wizard.bleId ? wizard.bleName || wizard.bleId : 'Not paired'}
        />
        <View style={styles.confirmDivider} />
        <ConfirmRow
          icon={TextT}
          iconColor={theme.highlight.color}
          label="Name"
          value={wizard.name.trim() || 'Unnamed board'}
        />
        {wizard.description.trim() ? (
          <>
            <View style={styles.confirmDivider} />
            <ConfirmRow
              icon={TextT}
              iconColor={theme.highlight.color}
              label="Description"
              value={wizard.description.trim()}
            />
          </>
        ) : null}
        <View style={styles.confirmDivider} />
        <ConfirmRow
          icon={BatteryFull}
          iconColor={theme.gps.color}
          label={wizard.batterySummary.title}
          value={wizard.batterySummary.value}
        />
      </View>
      <View style={styles.actionRow}>
        <Button
          style={styles.actionButton}
          label="Back"
          variant="secondary"
          onPress={wizard.back}
          testID="add-board-confirm-back"
        />
        <Button
          style={styles.actionButton}
          label="Save"
          icon={CheckCircle}
          onPress={wizard.save}
          disabled={!wizard.canSave}
          testID="add-board-save"
        />
      </View>
    </StepContainer>
  )
}

// ── Shared sub-components ──

interface StepContainerProps {
  title: string
  icon: typeof Bluetooth
  color: string
  children: React.ReactNode
}

function StepContainer({ title, icon: Icon, color, children }: StepContainerProps) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <Icon size={20} color={color} weight="duotone" />
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

interface NavActionsProps {
  canContinue: boolean
  onBack: () => void
  onNext: () => void
  testIDPrefix: string
}

function NavActions({ canContinue, onBack, onNext, testIDPrefix }: NavActionsProps) {
  return (
    <View style={styles.actionRow}>
      <Button
        style={styles.actionButton}
        label="Back"
        variant="secondary"
        onPress={onBack}
        testID={`${testIDPrefix}-back`}
      />
      <Button
        style={styles.actionButton}
        label="Next"
        onPress={onNext}
        disabled={!canContinue}
        testID={`${testIDPrefix}-next`}
      />
    </View>
  )
}

interface ConfirmRowProps {
  icon: typeof Bluetooth
  iconColor: string
  label: string
  value: string
}

function ConfirmRow({ icon: Icon, iconColor, label, value }: ConfirmRowProps) {
  return (
    <View style={styles.confirmRow}>
      <Icon size={16} color={iconColor} weight="duotone" />
      <View style={styles.confirmRowText}>
        <Text style={styles.confirmLabel}>{label}</Text>
        <Text style={styles.confirmValue}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  progressContainer: {
    gap: 8,
    marginBottom: 12,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.neutral.border,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressLabel: {
    color: theme.neutral.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  step: {
    gap: 14,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepHeaderSpacer: {
    flex: 1,
  },
  skipLink: {
    color: theme.bran.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepTitle: {
    color: theme.neutral.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanStatus: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    color: theme.neutral.textDim,
    textAlign: 'center',
    marginTop: 32,
    fontSize: 13,
  },
  otherDevicesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  otherDevicesLabel: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  pairedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.gps.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.gps.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pairedText: {
    color: theme.gps.text,
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
  },
  confirmCard: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    paddingVertical: 4,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  confirmRowText: {
    flex: 1,
    gap: 1,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: theme.neutral.border,
    marginLeft: 42,
  },
  confirmLabel: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  confirmValue: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
})

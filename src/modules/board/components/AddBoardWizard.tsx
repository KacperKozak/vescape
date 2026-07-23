import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/base/Text'
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
  BellRinging,
  BatteryMedium,
  ThermometerSimple,
  ThermometerHot,
  Speedometer,
  Lightning,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { AlertPresetMetricSetup } from '@/modules/alerts/components/AlertPresetMetricSetup'
import { RiderTopSpeedCard } from '@/modules/alerts/components/RiderTopSpeedCard'
import {
  ALERT_PRESET_METRICS,
  formatAlertPresetSummary,
  normalizeAlertPresetSelection,
  type AlertPresetMetric,
} from '@/modules/alerts/lib/alertPresets'
import { deriveBatteryConfig } from '@/modules/battery/lib'
import { BoardBatteryForm } from '@/modules/board/components/BoardBatteryForm'
import { BoardInfoForm } from '@/modules/board/components/BoardInfoForm'
import { BoardLinkTimeline } from '@/modules/board/components/BoardLinkTimeline'
import { Button } from '@/components/base/Button'
import { DeviceRow } from '@/components/base/DeviceRow'
import { theme } from '@/constants/theme'
import { type UseAddBoardWizard, type WizardStepId } from '@/modules/board/hooks/useAddBoardWizard'
import { useBoardLink } from '@/modules/board/hooks/useBoardLink'
import { formatBmsSuffix, formatBoardTransport } from '@/modules/board/lib/boardTransport'
import { useBleStore, NUS_SERVICE_UUID } from '@/modules/board/store/bleStore'
import { useBoardStore } from '@/modules/board/store/boardStore'
import { usePermissions } from '@/modules/settings/hooks/usePermissions'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

const STEP_META: Record<WizardStepId, { label: string; icon: typeof Bluetooth; color: string }> = {
  scan: { label: 'Pair', icon: Bluetooth, color: theme.palette.sky.color },
  name: { label: 'Name', icon: TextT, color: theme.palette.yellow.color },
  battery: { label: 'Battery', icon: BatteryFull, color: theme.palette.green.color },
  presets: { label: 'Alerts', icon: BellRinging, color: theme.palette.amber.color },
  confirm: { label: 'Confirm', icon: CheckCircle, color: theme.palette.purple.color },
}

interface AlertSubstep {
  key: 'rider-top-speed' | AlertPresetMetric
  title: string
  icon: typeof Bluetooth
}

// Per-metric title + icon for the Alert sub-steps — icon shapes match the metric identities
// used elsewhere (e.g. the history stats bar), all tinted the shared alert amber below.
// `name` labels the review-summary row; the sub-step header uses "<name> alerts".
const ALERT_METRIC_META: Record<AlertPresetMetric, { name: string; icon: typeof Bluetooth }> = {
  battery: { name: 'Battery', icon: BatteryMedium },
  'motor-temp': { name: 'Motor temp', icon: ThermometerSimple },
  'controller-temp': { name: 'Controller temp', icon: ThermometerHot },
  speed: { name: 'Speed', icon: Speedometer },
  duty: { name: 'Duty', icon: Lightning },
}

/** Ordered Alert sub-steps: Rider Top Speed first, then one page per preset metric. */
const ALERT_SUBSTEPS: AlertSubstep[] = [
  { key: 'rider-top-speed', title: 'Rider top speed', icon: BellRinging },
  ...ALERT_PRESET_METRICS.map((metric) => ({
    key: metric,
    title: `${ALERT_METRIC_META[metric].name} alerts`,
    icon: ALERT_METRIC_META[metric].icon,
  })),
]

interface Props {
  wizard: UseAddBoardWizard
  onLinkActiveStepIndexChange?: (index: number) => void
}

export function AddBoardWizard({ wizard, onLinkActiveStepIndexChange }: Props) {
  return (
    <>
      <ProgressBar steps={wizard.steps} step={wizard.step} />
      {wizard.stepId === 'scan' && (
        <ScanStep wizard={wizard} onLinkActiveStepIndexChange={onLinkActiveStepIndexChange} />
      )}
      {wizard.stepId === 'name' && <NameStep wizard={wizard} />}
      {wizard.stepId === 'battery' && <BatteryStep wizard={wizard} />}
      {wizard.stepId === 'presets' && <PresetsStep wizard={wizard} />}
      {wizard.stepId === 'confirm' && <ConfirmStep wizard={wizard} />}
    </>
  )
}

function ProgressBar({ steps, step }: { steps: readonly WizardStepId[]; step: number }) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        {steps.map((id, index) => (
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
        {steps.map((id, index) => {
          const meta = STEP_META[id]
          const active = index <= step
          return (
            <View key={id} style={styles.progressLabelItem}>
              <meta.icon
                size={12}
                color={active ? meta.color : theme.palette.slate.textDim}
                weight="bold"
              />
              <Text
                style={[styles.progressLabel, active && { color: meta.color }]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ScanStep({ wizard, onLinkActiveStepIndexChange }: Props) {
  if (wizard.pairPhase === 'probing') {
    return <LinkStep wizard={wizard} onLinkActiveStepIndexChange={onLinkActiveStepIndexChange} />
  }
  return <ScanSelectStep wizard={wizard} />
}

function LinkStep({ wizard, onLinkActiveStepIndexChange }: Props) {
  const link = useBoardLink(wizard.bleId || null)

  return (
    <View style={styles.step}>
      <BoardLinkTimeline
        phase={link.phase}
        progress={link.progress}
        candidates={link.candidates}
        selected={link.selected}
        onSelect={link.select}
        deviceLabel={wizard.bleName || wizard.bleId}
        bleId={wizard.bleId}
        testIDPrefix="add-board-link"
        onActiveStepIndexChange={onLinkActiveStepIndexChange}
        actions={
          link.phase === 'picking' ? (
            <Button
              style={styles.upgradeButton}
              label="Save link"
              icon={CheckCircle}
              disabled={link.selectedLink == null}
              onPress={() => {
                if (link.selectedLink) wizard.onDeviceProbed(link.selectedLink)
              }}
              testID="add-board-link-save"
            />
          ) : link.phase === 'failed' ? (
            <>
              <Button
                style={styles.upgradeButton}
                label="Retry"
                icon={WifiHigh}
                onPress={link.retry}
                testID="add-board-link-retry"
              />
              <Button
                label="Choose another device"
                variant="secondary"
                icon={Bluetooth}
                onPress={wizard.clearDevice}
                testID="add-board-link-choose-another"
              />
              <Button
                label="Create offline"
                variant="secondary"
                onPress={wizard.continueOffline}
                testID="add-board-link-offline"
              />
            </>
          ) : null
        }
      />
    </View>
  )
}

function ScanSelectStep({ wizard }: Props) {
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
        <Bluetooth size={20} color={theme.palette.sky.color} weight="duotone" />
        <Text style={styles.stepTitle}>Pair your board</Text>
        <View style={styles.stepHeaderSpacer} />
        {wizard.draftLink ? (
          <Pressable onPress={wizard.next} hitSlop={8} testID="add-board-pair-next">
            <Text style={styles.skipLink}>Next →</Text>
          </Pressable>
        ) : (
          <Pressable onPress={wizard.continueOffline} hitSlop={8} testID="add-board-skip-pairing">
            <Text style={styles.skipLink}>Skip</Text>
          </Pressable>
        )}
      </View>

      {wizard.draftLink ? (
        <>
          <View style={styles.pairedBanner}>
            <Bluetooth size={16} color={theme.palette.green.color} weight="duotone" />
            <Text style={styles.pairedText}>
              Linked to {wizard.bleName || wizard.bleId} ·{' '}
              {formatBoardTransport(wizard.draftLink.transport)}
              {formatBmsSuffix(wizard.draftLink.hasBms)}
            </Text>
          </View>
          <Button
            label="Change device"
            variant="secondary"
            icon={Bluetooth}
            onPress={wizard.clearDevice}
          />
        </>
      ) : (
        <>
          <View style={styles.scanHeader}>
            {isScanning && <ActivityIndicator color={theme.palette.sky.color} size="small" />}
            <SignalIcon
              size={14}
              color={isScanning ? theme.palette.sky.color : theme.palette.slate.textMuted}
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
                  <CaretDown size={12} color={theme.palette.slate.textMuted} weight="bold" />
                ) : (
                  <CaretRight size={12} color={theme.palette.slate.textMuted} weight="bold" />
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
    <StepContainer
      title="Name your board"
      icon={TextT}
      color={theme.palette.yellow.color}
      footer={
        <NavActions
          canContinue={Boolean(wizard.name.trim())}
          onBack={wizard.back}
          onNext={wizard.next}
          testIDPrefix="add-board-name"
        />
      }
    >
      <BoardInfoForm
        name={wizard.name}
        description={wizard.description}
        onChangeName={wizard.setName}
        onChangeDescription={wizard.setDescription}
        nameTestID="add-board-name-input"
        descriptionTestID="add-board-description-input"
      />
    </StepContainer>
  )
}

function BatteryStep({ wizard }: Props) {
  return (
    <StepContainer
      title="Battery config"
      icon={BatteryFull}
      color={theme.palette.green.color}
      footer={
        <NavActions
          canContinue={wizard.batteryWarning == null}
          onBack={wizard.back}
          onNext={wizard.next}
          testIDPrefix="add-board-battery"
        />
      }
    >
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
        testIDPrefix="add-board-battery"
      />
    </StepContainer>
  )
}

function PresetsStep({ wizard }: Props) {
  const [sub, setSub] = useState(0)
  const substep = ALERT_SUBSTEPS[sub]!
  const isFirst = sub === 0
  const isLast = sub === ALERT_SUBSTEPS.length - 1

  // Back off the first sub-step returns to Battery; Next past the last advances to Confirm.
  const onBack = () => (isFirst ? wizard.back() : setSub((s) => s - 1))
  const onNext = () => (isLast ? wizard.next() : setSub((s) => s + 1))

  return (
    <StepContainer
      title={substep.title}
      icon={substep.icon}
      color={theme.palette.amber.color}
      headerRight={
        <>
          <Text style={styles.substepCounter}>
            {sub + 1}/{ALERT_SUBSTEPS.length}
          </Text>
          <SubstepProgress total={ALERT_SUBSTEPS.length} index={sub} />
          <Pressable
            style={styles.substepSkip}
            onPress={wizard.next}
            hitSlop={8}
            testID="add-board-skip-alerts"
          >
            <Text style={styles.skipLink}>Skip</Text>
          </Pressable>
        </>
      }
      footer={
        <NavActions
          canContinue
          onBack={onBack}
          onNext={onNext}
          nextLabel={isLast ? 'Done' : 'Next'}
          testIDPrefix="add-board-presets"
        />
      }
    >
      {isFirst ? (
        <>
          <Text style={styles.presetsHint}>
            The fastest you consider yourself capable of riding. Scales the speed gauge and alerts.
          </Text>
          <RiderTopSpeedCard />
        </>
      ) : (
        <>
          <Text style={styles.presetsHint}>
            Pick how loudly this metric warns you. Adjust it any time from its control on the main
            screen.
          </Text>
          <AlertPresetMetricSetup metric={substep.key as AlertPresetMetric} />
        </>
      )}
    </StepContainer>
  )
}

function ConfirmStep({ wizard }: Props) {
  const riderTopSpeedKmh = useSettingsStore((s) => s.riderTopSpeedKmh)
  const alertPreset = useSettingsStore((s) => s.alertPreset)
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const alertSummaries = useMemo(() => {
    const selection = normalizeAlertPresetSelection(alertPreset)
    const hasBatteryConfig = deriveBatteryConfig(board?.batteryConfig ?? null).warning == null
    return ALERT_PRESET_METRICS.map((metric) => ({
      metric,
      summary: formatAlertPresetSummary(metric, selection[metric], {
        riderTopSpeedKmh,
        hasBatteryConfig,
      }),
    })).filter((row): row is { metric: AlertPresetMetric; summary: string } => row.summary != null)
  }, [alertPreset, board?.batteryConfig, riderTopSpeedKmh])

  return (
    <StepContainer
      title="Review & save"
      icon={CheckCircle}
      color={theme.palette.purple.color}
      footer={
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
      }
    >
      <View style={styles.confirmCard}>
        <ConfirmRow
          icon={Bluetooth}
          iconColor={theme.palette.sky.color}
          label="Board Link"
          value={
            wizard.draftLink
              ? `${wizard.bleName || wizard.bleId} · ${formatBoardTransport(wizard.draftLink.transport)}${formatBmsSuffix(wizard.draftLink.hasBms)}`
              : 'Offline (not linked)'
          }
        />
        <View style={styles.confirmDivider} />
        <ConfirmRow
          icon={TextT}
          iconColor={theme.palette.yellow.color}
          label="Name"
          value={wizard.name.trim() || 'Unnamed board'}
        />
        {wizard.description.trim() ? (
          <>
            <View style={styles.confirmDivider} />
            <ConfirmRow
              icon={TextT}
              iconColor={theme.palette.yellow.color}
              label="Description"
              value={wizard.description.trim()}
            />
          </>
        ) : null}
        <View style={styles.confirmDivider} />
        <ConfirmRow
          icon={BatteryFull}
          iconColor={theme.palette.green.color}
          label={wizard.batterySummary.title}
          value={wizard.batterySummary.value}
        />
      </View>

      <Text style={styles.confirmSectionTitle}>Alerts</Text>
      <View style={styles.confirmCard}>
        {alertSummaries.length === 0 ? (
          <ConfirmRow
            icon={BellRinging}
            iconColor={theme.palette.amber.color}
            label="Alerts"
            value="All off"
          />
        ) : (
          alertSummaries.map(({ metric, summary }, index) => (
            <View key={metric}>
              {index > 0 ? <View style={styles.confirmDivider} /> : null}
              <ConfirmRow
                icon={ALERT_METRIC_META[metric].icon}
                iconColor={theme.palette.amber.color}
                label={ALERT_METRIC_META[metric].name}
                value={summary}
              />
            </View>
          ))
        )}
      </View>
    </StepContainer>
  )
}

// ── Shared sub-components ──

/** Full-width segmented indicator for the Alert sub-steps, filled up to `index` in amber. */
function SubstepProgress({ total, index }: { total: number; index: number }) {
  return (
    <View style={styles.substepBar}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.substepSegment, i <= index && styles.substepSegmentActive]} />
      ))}
    </View>
  )
}

interface StepContainerProps {
  title: string
  icon: typeof Bluetooth
  color: string
  /** Optional right-aligned header content (e.g. a sub-step counter + Skip link). */
  headerRight?: React.ReactNode
  /** Pinned to the bottom of the screen — the Back/Next (or Save) row. */
  footer?: React.ReactNode
  children: React.ReactNode
}

// Title + content are vertically centered in the free space; `headerRight` (e.g. the
// Skip link) stays pinned top-right and the footer pins to the bottom — the shared
// frame for every step past Pair.
function StepContainer({
  title,
  icon: Icon,
  color,
  headerRight,
  footer,
  children,
}: StepContainerProps) {
  return (
    <View style={styles.stepFill}>
      {headerRight ? <View style={styles.stepTopBar}>{headerRight}</View> : null}
      <View style={styles.stepBody}>
        <View style={styles.stepHeader}>
          <Icon size={20} color={color} weight="duotone" />
          <Text style={styles.stepTitle}>{title}</Text>
        </View>
        {children}
      </View>
      {footer}
    </View>
  )
}

interface NavActionsProps {
  canContinue: boolean
  onBack: () => void
  onNext: () => void
  nextLabel?: string
  testIDPrefix: string
}

function NavActions({
  canContinue,
  onBack,
  onNext,
  nextLabel = 'Next',
  testIDPrefix,
}: NavActionsProps) {
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
        label={nextLabel}
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
    backgroundColor: theme.palette.slate.border,
  },
  progressLabels: {
    flexDirection: 'row',
    gap: 4,
  },
  // flex:1 mirrors each progress segment above so the label sits left-aligned under it
  // (matching the segment's left edge), not spread across the row.
  progressLabelItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.palette.slate.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  step: {
    gap: 14,
  },
  // Fills the free height below the progress bar so the footer can pin to the bottom.
  stepFill: {
    flex: 1,
    gap: 14,
  },
  // Vertically centers the title + step content between the top bar and the pinned footer.
  stepBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  // counter (left) · dashes (centered) · Skip (right), above the centered body.
  stepTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  substepCounter: {
    flex: 1,
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  substepSkip: {
    flex: 1,
    alignItems: 'flex-end',
  },
  substepBar: {
    flexDirection: 'row',
    gap: 4,
  },
  substepSegment: {
    width: 12,
    height: 2,
    backgroundColor: theme.palette.slate.border,
  },
  substepSegmentActive: {
    backgroundColor: theme.palette.amber.color,
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
    color: theme.palette.cyan.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  presetsHint: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanStatus: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    color: theme.palette.slate.textDim,
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
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  pairedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.palette.green.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.palette.green.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pairedText: {
    color: theme.palette.green.text,
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
  upgradeButton: {
    backgroundColor: theme.status.upgrade.color,
  },
  confirmCard: {
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    paddingVertical: 4,
  },
  confirmSectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
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
    backgroundColor: theme.palette.slate.border,
    marginLeft: 42,
  },
  confirmLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  confirmValue: {
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
})

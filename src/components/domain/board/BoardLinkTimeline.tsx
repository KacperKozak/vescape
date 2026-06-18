import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  BatteryChargingIcon,
  BluetoothIcon,
  CheckIcon,
  HandshakeIcon,
  type Icon,
  LightningIcon,
  LinkIcon,
  PathIcon,
  PulseIcon,
} from 'phosphor-react-native'
import type { BoardCandidate, BoardProbeProgressEvent, BoardProbeStep } from 'vesc-ble'

import { IconHero } from '@/components/ui/settings/IconHero'
import { StepTimeline, type StepState, type TimelineStep } from '@/components/ui/base/StepTimeline'
import type { BoardLinkPhase } from '@/hooks/useBoardLink'
import { formatBoardTransport } from '@/lib/boardTransport'
import { interaction, theme } from '@/constants/theme'

type StepKey = 'connect' | 'handshake' | 'transport' | 'telemetry' | 'bms'

const STEP_KEYS: StepKey[] = ['connect', 'handshake', 'transport', 'telemetry', 'bms']

const STEP_LABEL: Record<StepKey, string> = {
  connect: 'Connecting',
  handshake: 'Handshake',
  transport: 'Transport',
  telemetry: 'Telemetry',
  bms: 'Smart BMS',
}

const STEP_ICON: Record<StepKey, Icon> = {
  connect: BluetoothIcon,
  handshake: HandshakeIcon,
  transport: PathIcon,
  telemetry: PulseIcon,
  bms: BatteryChargingIcon,
}

/** What each step does — shown until a concrete result replaces it. */
const STEP_DESC: Record<StepKey, string> = {
  connect: 'Opening the BLE GATT link',
  handshake: 'Discovering the VESC service',
  transport: 'Finding a working transport',
  telemetry: 'Waiting for a valid sample',
  bms: 'Checking for a smart BMS',
}

/**
 * Index of the live step driving the spinner, from the native probe's coarse,
 * monotonic phase. Only Connecting, Handshake, and the single Transport step ever
 * show the active spinner; Telemetry and BMS resolve from the candidates when the
 * probe finishes, so they never blink.
 */
const STEP_REACH: Record<BoardProbeStep, number> = {
  connecting: 0,
  handshake: 1,
  probing: 2,
  completed: STEP_KEYS.length,
  failed: -1,
}

interface Props {
  phase: BoardLinkPhase
  progress: BoardProbeProgressEvent | null
  candidates: BoardCandidate[]
  selected: BoardCandidate | null
  onSelect: (candidate: BoardCandidate) => void
  /** Primary identity of the thing being linked (board name, or BLE name). */
  deviceLabel: string
  /** Hide the internal IconHero header (caller renders it elsewhere, e.g. pinned top). */
  hideHeader?: boolean
  /** Peripheral id, surfaced as the "Connected to …" finding. */
  bleId?: string | null
  /** Terminal actions (Save / Retry / Choose another), rendered after the timeline. */
  actions?: ReactNode
  /** Muted note under a failed terminal, e.g. "Existing link kept". */
  failureNote?: string
  testIDPrefix: string
}

/**
 * One fixed linking checklist that fills in as the Board Probe advances. The
 * transport is a single step whose result is Direct or a CAN id; resolved steps
 * recolour in place rather than appending rows. The only card is the
 * multi-transport picker — an interactive group — shown below the checklist.
 */
export function BoardLinkTimeline({
  phase,
  progress,
  candidates,
  selected,
  onSelect,
  deviceLabel,
  hideHeader,
  bleId,
  actions,
  failureNote,
  testIDPrefix,
}: Props) {
  const steps = buildSteps(phase, progress, candidates, bleId)
  const showPicker = phase === 'picking' && candidates.length > 1

  return (
    <View style={styles.container} testID={testIDPrefix}>
      {hideHeader ? null : (
        <IconHero
          icon={LinkIcon}
          title={deviceLabel}
          description="Linking your board over Bluetooth"
        />
      )}

      <StepTimeline steps={steps} />

      {showPicker ? (
        <View style={styles.pickerCard}>
          {candidates.map((candidate, i) => {
            const isSelected = candidate.transport === selected?.transport
            return (
              <Pressable
                key={String(candidate.transport)}
                style={[styles.pickerRow, i > 0 && styles.pickerRowDivider]}
                android_ripple={interaction.ripple}
                onPress={() => onSelect(candidate)}
                testID={`${testIDPrefix}-option-${candidate.transport}`}
              >
                <View style={[styles.radio, isSelected && styles.radioOn]}>
                  {isSelected ? (
                    <CheckIcon size={16} color={theme.wheel.color} weight="bold" />
                  ) : null}
                </View>
                <Text style={styles.pickerLabel}>{formatBoardTransport(candidate.transport)}</Text>
                {candidate.hasBms ? <BmsChip /> : null}
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {phase === 'failed' && failureNote ? (
        <Text style={styles.failureNote}>{failureNote}</Text>
      ) : null}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  )
}

/** Resolve the fixed checklist rows for the current phase. */
function buildSteps(
  phase: BoardLinkPhase,
  progress: BoardProbeProgressEvent | null,
  candidates: BoardCandidate[],
  bleId?: string | null,
): TimelineStep[] {
  const reach = progress ? STEP_REACH[progress.step] : 0
  const connected = `Connected to ${bleId ?? '…'}`

  if (phase === 'picking') {
    const hasDirect = candidates.some((c) => c.transport === 'direct')
    const canIds = candidates
      .map((c) => c.transport)
      .filter((t): t is number => typeof t === 'number')
    const anyBms = candidates.some((c) => c.hasBms)
    const transportCaption = [
      hasDirect ? 'Direct link' : null,
      ...canIds.map((id) => `CAN id ${id}`),
    ]
      .filter(Boolean)
      .join(' · ')
    return [
      row('connect', 'done', connected),
      row('handshake', 'done', 'VESC service ready'),
      row('transport', 'done', transportCaption || 'Transport confirmed'),
      row('telemetry', 'done', 'Valid telemetry sample decoded'),
      row('bms', anyBms ? 'done' : 'absent', anyBms ? 'Smart BMS answered on CAN' : 'No smart BMS'),
    ]
  }

  if (phase === 'failed') {
    const didConnect = reach >= 1
    return [
      row(
        'connect',
        didConnect ? 'done' : 'failed',
        didConnect ? connected : 'Could not open BLE connection',
      ),
      row(
        'handshake',
        didConnect ? 'done' : 'pending',
        didConnect ? 'VESC service ready' : STEP_DESC.handshake,
      ),
      row(
        'transport',
        didConnect ? 'failed' : 'pending',
        didConnect ? 'No transport returned telemetry' : STEP_DESC.transport,
      ),
      row('telemetry', 'absent', 'No valid sample'),
      row('bms', 'absent', 'No smart BMS'),
    ]
  }

  // Live linking: the active spinner walks connect → handshake → transport. A row
  // upgrades to its result the moment it passes; connect and handshake have known
  // outcomes, so they update live. Transport/Telemetry/BMS can't resolve until the
  // probe confirms a transport (the `picking` phase), so clamp here — Transport
  // never goes green before its "CAN id …" result exists, and the green tick and
  // the result appear together rather than a beat apart.
  const transportIndex = STEP_KEYS.indexOf('transport')
  const liveReach = Math.min(reach, transportIndex)
  const liveDone: Partial<Record<StepKey, string>> = {
    connect: connected,
    handshake: 'VESC service ready',
  }
  return STEP_KEYS.map((key, i): TimelineStep => {
    const state: StepState = i < liveReach ? 'done' : i === liveReach ? 'active' : 'pending'
    const caption = (state === 'done' && liveDone[key]) || STEP_DESC[key]
    return { key, icon: STEP_ICON[key], label: STEP_LABEL[key], state, caption }
  })
}

function row(key: StepKey, state: StepState, caption: string): TimelineStep {
  return { key, icon: STEP_ICON[key], label: STEP_LABEL[key], state, caption }
}

function BmsChip() {
  return (
    <View style={styles.bmsChip}>
      <LightningIcon size={12} color={theme.gps.color} weight="duotone" />
      <Text style={styles.bmsChipText}>BMS</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  pickerCard: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pickerRowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.neutral.border,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: theme.neutral.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: theme.wheel.color,
  },
  pickerLabel: {
    flex: 1,
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  bmsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.gps.bg,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bmsChipText: {
    color: theme.gps.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  failureNote: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    gap: 10,
  },
})

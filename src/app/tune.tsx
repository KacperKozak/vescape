import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useNavigation } from 'expo-router'
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  BluetoothSlashIcon,
  CheckIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getRefloatConfigSnapshot,
  type RefloatConfigField,
  type RefloatConfigGroup,
  type RefloatConfigSnapshot,
  type TuneProfileFieldValue,
} from 'vesc-ble'

import { InfoModal } from '@/components/InfoModal'
import { Placeholder } from '@/components/Placeholder'
import { useBleStore } from '@/store/bleStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'

type LoadState =
  | { phase: 'loading'; snapshot: RefloatConfigSnapshot | null; error: string | null }
  | { phase: 'ready'; snapshot: RefloatConfigSnapshot; error: null }
  | { phase: 'error'; snapshot: RefloatConfigSnapshot | null; error: string }

type InfoModalState = {
  title: string
  message: string
} | null

type EditorState = {
  field: RefloatConfigField
  value: number
  text: string
} | null

interface BasicSliderItem {
  id: string
  label: string
  value: number | null
  min: number
  max: number
  step: number
  source: string
  info: string
}

const FIELD_INFO: Record<string, string> = {
  kp: 'Main proportional angle response. Higher values make the board respond more strongly to nose angle error.',
  kp2: 'Responds to angular velocity. This acts like damping and is especially noticeable during fast or aggressive nose-angle changes.',
  kp_brake: 'Multiplier for angle response while braking.',
  kp2_brake: 'Multiplier for rate response while braking.',
  ki: 'Integral angle correction. This helps remove sustained angle error over time.',
  ki_limit: 'Limits how much authority the integral correction can build up.',
  mahony_kp:
    'Pitch-axis Mahony filter accelerometer correction. Higher values feel looser and linger more; lower values feel snappier.',
  mahony_kp_roll:
    'Roll-axis Mahony filter correction. Lower roll correction can help the nose hold up in turns and make tight carves feel stiffer.',
  atr_strength_up:
    'Nose lift applied from adaptive torque response during uphill or acceleration load.',
  atr_strength_down:
    'Nose lowering applied from adaptive torque response during downhill or braking load.',
  atr_threshold_up: 'Angle threshold before uphill ATR behavior starts.',
  atr_threshold_down: 'Angle threshold before downhill ATR behavior starts.',
  atr_speed_boost: 'Boosts ATR response as speed increases.',
  atr_angle_limit: 'Maximum angle ATR tiltback is allowed to apply.',
  atr_on_speed: 'Maximum speed where ATR tiltback can be applied.',
  atr_off_speed: 'Maximum speed where ATR tiltback can be released.',
  atr_response_boost: 'Boost factor for tiltback response.',
  atr_transition_boost: 'Boost factor around ATR response transitions.',
  atr_filter: 'Current filter frequency used by ATR.',
  atr_amps_accel_ratio: 'Ratio used by acceleration-side ATR behavior.',
  atr_amps_decel_ratio: 'Ratio used by deceleration-side ATR behavior.',
  torquetilt_strength:
    'Nose lift based on positive output current. The basic Nose stiffness control writes this value.',
  torquetilt_strength_regen:
    'Nose lowering based on negative regen current. The basic Tail stiffness control writes this value.',
  torquetilt_start_current: 'Current threshold before torque tiltback starts.',
  torquetilt_angle_limit: 'Maximum angle torque tiltback is allowed to apply.',
  torquetilt_on_speed: 'Maximum speed where torque tiltback can be applied.',
  torquetilt_off_speed: 'Maximum speed where torque tiltback can be released.',
  turntilt_strength: 'Turn tiltback strength. The basic Carve tilt control writes this directly.',
  turntilt_angle_limit: 'Maximum turn tiltback angle.',
  turntilt_start_angle: 'Turn aggregate threshold before turn tiltback response starts.',
  turntilt_start_erpm: 'ERPM threshold before turn tiltback response starts.',
  turntilt_speed: 'Maximum speed where turn tiltback can be applied.',
  turntilt_erpm_boost: 'Speed-based boost percentage for turn tiltback.',
  turntilt_erpm_boost_end: 'ERPM where turn tiltback speed boost reaches its maximum.',
  turntilt_yaw_aggregate: 'Target accumulated yaw or turn value for turn tiltback.',
  braketilt_strength: 'Brake tilt strength. The basic Brake tilt control writes this directly.',
  braketilt_lingering: 'Controls how brake tilt lingers or releases after braking.',
  tiltback_constant: 'Constant nose angle offset.',
  tiltback_variable: 'Variable tiltback amount per ERPM.',
  tiltback_variable_max: 'Maximum variable tiltback target.',
}

function formatValue(value: number | boolean | string): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to read Refloat config.'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function fieldStep(field: RefloatConfigField): number {
  if (Number.isInteger(field.value) && Number.isInteger(field.min) && Number.isInteger(field.max)) {
    return 1
  }
  const range = (field.max ?? 1) - (field.min ?? 0)
  if (range <= 1) return 0.01
  if (range <= 5) return 0.05
  if (range <= 20) return 0.1
  if (range <= 100) return 1
  return 10
}

function snapFieldValue(value: number, field: RefloatConfigField): number {
  const min = field.min ?? 0
  const max = field.max ?? 1
  const step = fieldStep(field)
  const snapped = Math.round((value - min) / step) * step + min
  const decimals = step < 1 ? Math.ceil(Math.abs(Math.log10(step))) : 0
  return Number(clamp(snapped, min, max).toFixed(decimals))
}

function fieldNumber(fields: Map<string, RefloatConfigField>, id: string): number | null {
  const value = fields.get(id)?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatSliderValue(item: BasicSliderItem): string {
  if (item.value == null) return 'Missing'
  return Number.isInteger(item.value) ? item.value.toFixed(0) : item.value.toFixed(1)
}

function basicSlidersFromSnapshot(snapshot: RefloatConfigSnapshot): BasicSliderItem[] {
  const fields = new Map(
    snapshot.groups.flatMap((group) => group.fields.map((field) => [field.id, field])),
  )
  const kp = fieldNumber(fields, 'kp')
  const torqueTilt = fieldNumber(fields, 'torquetilt_strength')
  const torqueTiltRegen = fieldNumber(fields, 'torquetilt_strength_regen')
  const turnTilt = fieldNumber(fields, 'turntilt_strength')
  const brakeTilt = fieldNumber(fields, 'braketilt_strength')
  const atrUp = fieldNumber(fields, 'atr_strength_up')
  const atrDown = fieldNumber(fields, 'atr_strength_down')
  const atrStrength = atrUp != null || atrDown != null ? Math.max(atrUp ?? 0, atrDown ?? 0) : null

  return [
    {
      id: 'aggressiveness',
      label: 'Aggressiveness',
      value: kp == null ? null : clamp(kp - 20, -5, 10),
      min: -5,
      max: 10,
      step: 1,
      source: 'kp',
      info: 'Derived from Angle P as kp - 20, clamped to -5..10. In write mode this would coordinate PID and Mahony filter values together.',
    },
    {
      id: 'noseStiffness',
      label: 'Nose stiffness',
      value: torqueTilt == null ? null : clamp(torqueTilt / 0.03, 0, 10),
      min: 0,
      max: 10,
      step: 1,
      source: 'torquetilt_strength',
      info: 'Derived from acceleration torque tiltback strength divided by 0.03. This represents nose lift from positive output current.',
    },
    {
      id: 'tailStiffness',
      label: 'Tail stiffness',
      value: torqueTiltRegen == null ? null : clamp(torqueTiltRegen / 0.03, 0, 10),
      min: 0,
      max: 10,
      step: 1,
      source: 'torquetilt_strength_regen',
      info: 'Derived from regen torque tiltback strength divided by 0.03. This represents nose lowering from negative regen current.',
    },
    {
      id: 'carveTilt',
      label: 'Carve tilt',
      value: turnTilt == null ? null : clamp(turnTilt, 0, 15),
      min: 0,
      max: 15,
      step: 1,
      source: 'turntilt_strength',
      info: 'Derived directly from turn tiltback strength.',
    },
    {
      id: 'brakeTilt',
      label: 'Brake tilt',
      value: brakeTilt == null ? null : clamp(brakeTilt, 0, 5),
      min: 0,
      max: 5,
      step: 1,
      source: 'braketilt_strength',
      info: 'Derived directly from brake tiltback strength.',
    },
    {
      id: 'atrIntensity',
      label: 'ATR intensity',
      value: atrStrength == null ? null : clamp((atrStrength / 2) * 15, 0, 15),
      min: 0,
      max: 15,
      step: 1,
      source: 'atr_strength_up/down',
      info: 'Derived from the stronger uphill or downhill ATR strength, mapped from 0..2 to 0..15.',
    },
  ]
}

function isDisplayableFieldValue(
  value: TuneProfileFieldValue | undefined,
): value is number | boolean | string {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
}

function groupsWithProfileValues(
  groups: RefloatConfigGroup[],
  fields: Record<string, TuneProfileFieldValue> | null,
): RefloatConfigGroup[] {
  if (!fields) return groups
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const value = fields[field.id]
      return isDisplayableFieldValue(value) ? { ...field, value } : field
    }),
  }))
}

function isEditableNumberField(field: RefloatConfigField): boolean {
  return (
    typeof field.value === 'number' &&
    Number.isFinite(field.value) &&
    field.min != null &&
    field.max != null &&
    Number.isFinite(field.min) &&
    Number.isFinite(field.max) &&
    field.max > field.min
  )
}

function fieldHelp(field: RefloatConfigField): string {
  return FIELD_INFO[field.id] ?? 'Read-only field decoded from the board custom config schema.'
}

export default function TuneScreen() {
  const navigation = useNavigation()
  const bleStatus = useBleStore((s) => s.status)
  const boardConnected = bleStatus === 'connected'
  const activeProfile = useTuneProfileStore((s) => s.activeProfile)
  const draftFields = useTuneProfileStore((s) => s.draftFields)
  const hasDirtyFields = useTuneProfileStore((s) => s.hasDirtyFields)
  const savingProfile = useTuneProfileStore((s) => s.saving)
  const profileError = useTuneProfileStore((s) => s.error)
  const loadProfiles = useTuneProfileStore((s) => s.loadProfiles)
  const setDraftField = useTuneProfileStore((s) => s.setDraftField)
  const getDirtyFields = useTuneProfileStore((s) => s.getDirtyFields)
  const revertField = useTuneProfileStore((s) => s.revertField)
  const discardAllEdits = useTuneProfileStore((s) => s.discardAllEdits)
  const saveActiveProfile = useTuneProfileStore((s) => s.saveActiveProfile)
  const clearProfiles = useTuneProfileStore((s) => s.clear)

  const [state, setState] = useState<LoadState>({
    phase: 'loading',
    snapshot: null,
    error: null,
  })
  const [infoModal, setInfoModal] = useState<InfoModalState>(null)
  const [editor, setEditor] = useState<EditorState>(null)

  const load = useCallback(async () => {
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await getRefloatConfigSnapshot()
      if (snapshot.boardId) {
        await loadProfiles(snapshot.boardId).catch(() => [])
      } else {
        clearProfiles()
      }
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [clearProfiles, loadProfiles])

  useEffect(() => {
    if (boardConnected) {
      load()
    }
  }, [boardConnected, load])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: activeProfile ? `Tune - ${activeProfile.name}` : 'Tune',
      headerRight: () =>
        boardConnected ? (
          <Pressable
            style={[styles.headerButton, state.phase === 'loading' && styles.headerButtonDisabled]}
            onPress={() => void load()}
            disabled={state.phase === 'loading'}
          >
            {state.phase === 'loading' ? (
              <ActivityIndicator size="small" color="#38bdf8" />
            ) : (
              <ArrowsClockwiseIcon size={17} color="#cbd5e1" weight="bold" />
            )}
          </Pressable>
        ) : null,
    })
  }, [activeProfile, boardConnected, load, navigation, state.phase])

  const snapshot = state.snapshot
  const profileFields = useMemo(
    () => (activeProfile ? { ...activeProfile.fields, ...draftFields } : null),
    [activeProfile, draftFields],
  )
  const displayGroups = useMemo(
    () => (snapshot ? groupsWithProfileValues(snapshot.groups, profileFields) : []),
    [profileFields, snapshot],
  )
  const displaySnapshot = useMemo(
    () => (snapshot ? { ...snapshot, groups: displayGroups } : null),
    [displayGroups, snapshot],
  )
  const basicSliders = useMemo(
    () => (displaySnapshot ? basicSlidersFromSnapshot(displaySnapshot) : []),
    [displaySnapshot],
  )

  const showBadgeInfo = (title: string, message: string) => {
    setInfoModal({ title, message })
  }

  const showFieldInfo = (field: RefloatConfigField) => {
    const limits =
      field.min != null || field.max != null
        ? `\n\nRange: ${field.min != null ? formatValue(field.min) : '-'} to ${
            field.max != null ? formatValue(field.max) : '-'
          }${field.unit ? ` ${field.unit}` : ''}`
        : ''
    const units = field.unit ? `\nUnit: ${field.unit}` : ''
    setInfoModal({
      title: field.label,
      message: `${fieldHelp(field)}${units}${limits}\nField ID: ${field.id}`,
    })
  }

  const closeInfo = () => setInfoModal(null)

  const openFieldEditor = (field: RefloatConfigField) => {
    if (!activeProfile) {
      showFieldInfo(field)
      return
    }
    if (!isEditableNumberField(field)) {
      showBadgeInfo(
        field.label,
        `${fieldHelp(field)}\n\nThis field is not numeric or has no schema bounds, so it cannot use the slider editor yet.\nField ID: ${field.id}`,
      )
      return
    }
    setEditor({
      field,
      value: field.value as number,
      text: formatValue(field.value),
    })
  }

  const closeEditor = () => setEditor(null)

  const saveProfile = () => {
    void saveActiveProfile().catch(() => undefined)
  }

  const dirtyFields = getDirtyFields()

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {!boardConnected && !snapshot ? (
        <Placeholder
          icon={BluetoothSlashIcon}
          title="Board not connected"
          description="Connect to a board to read tune config"
        />
      ) : null}

      {boardConnected && state.phase === 'loading' && !snapshot ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>Reading board config...</Text>
        </View>
      ) : null}

      {boardConnected && state.phase === 'error' && !snapshot ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          {state.phase === 'error' ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{state.error}</Text>
            </View>
          ) : null}

          {profileError ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{profileError}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            {activeProfile ? (
              <InfoBadge
                label={activeProfile.name}
                onPress={() =>
                  showBadgeInfo(
                    'Tune Profile',
                    `${activeProfile.name} profile loaded from local storage. Values shown on this screen come from the profile and fall back to the live snapshot for fields the profile does not contain.`,
                  )
                }
              />
            ) : null}
            {snapshot.fwVersion ? (
              <InfoBadge
                label={snapshot.fwVersion}
                onPress={() =>
                  showBadgeInfo(
                    'Firmware',
                    'Firmware reported by the connected controller. This is useful diagnostic context, but the config decoder uses the board XML schema as the source of truth.',
                  )
                }
              />
            ) : null}
            <InfoBadge
              label={`CAN ${snapshot.canId}`}
              onPress={() =>
                showBadgeInfo(
                  'CAN ID',
                  `Controller CAN ID ${snapshot.canId}. Refloat config commands are forwarded to this controller before reading the schema and binary config.`,
                )
              }
            />
            <InfoBadge
              label={`${snapshot.rawConfigLength} bytes`}
              onPress={() =>
                showBadgeInfo(
                  'Config Size',
                  `${snapshot.rawConfigLength} bytes is the size of the raw Refloat custom config payload read from the controller. The app decodes only known tune fields from that binary struct.`,
                )
              }
            />
            {snapshot.missingFieldIds.length > 0 ? (
              <InfoBadge
                label={`${snapshot.missingFieldIds.length} missing`}
                danger
                onPress={() =>
                  showBadgeInfo(
                    'Missing Fields',
                    `These allowlisted fields were not present in the board schema: ${snapshot.missingFieldIds.join(
                      ', ',
                    )}`,
                  )
                }
              />
            ) : null}
          </View>

          {hasDirtyFields ? (
            <View style={styles.dirtyBar}>
              <Text style={styles.dirtyBarText}>
                {Object.keys(dirtyFields).length} unsaved field
                {Object.keys(dirtyFields).length === 1 ? '' : 's'}
              </Text>
              <View style={styles.dirtyBarActions}>
                <Pressable style={styles.secondaryActionButton} onPress={discardAllEdits}>
                  <ArrowCounterClockwiseIcon size={14} color="#cbd5e1" weight="bold" />
                  <Text style={styles.secondaryActionText}>Discard all</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]}
                  onPress={saveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color="#020617" />
                  ) : (
                    <CheckIcon size={14} color="#020617" weight="bold" />
                  )}
                  <Text style={styles.saveButtonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Basic</Text>
              <Text style={styles.groupCount}>derived preview</Text>
            </View>
            <View style={styles.basicList}>
              {basicSliders.map((item) => (
                <BasicSlider
                  key={item.id}
                  item={item}
                  onInfo={() =>
                    showBadgeInfo(
                      item.label,
                      `${item.info}\n\nSource: ${item.source}\nRange: ${item.min} to ${item.max}, step ${item.step}`,
                    )
                  }
                />
              ))}
            </View>
          </View>

          {displayGroups.map((group) => (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupCount}>
                  {activeProfile
                    ? `${group.fields.length} profile values`
                    : `${group.fields.length} read-only values`}
                </Text>
              </View>
              <View style={styles.grid}>
                {group.fields.map((field) => (
                  <ConfigCell
                    key={field.id}
                    field={field}
                    savedValue={activeProfile?.fields[field.id]}
                    dirty={Object.prototype.hasOwnProperty.call(dirtyFields, field.id)}
                    onPress={() => openFieldEditor(field)}
                    onInfo={() => showFieldInfo(field)}
                    onRevert={() => revertField(field.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <InfoModal
        visible={infoModal != null}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onDismiss={closeInfo}
      />
      <FieldEditorSheet
        editor={editor}
        onCancel={closeEditor}
        onApply={(value) => {
          if (!editor) return
          setDraftField(editor.field.id, value)
          setEditor(null)
        }}
      />
    </SafeAreaView>
  )
}

function InfoBadge({
  label,
  danger = false,
  onPress,
}: {
  label: string
  danger?: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.metaBadge, danger && styles.metaBadgeDanger]} onPress={onPress}>
      <Text style={[styles.metaText, danger && styles.metaTextDanger]} selectable>
        {label}
      </Text>
      <InfoIcon size={12} color={danger ? '#fecaca' : '#64748b'} weight="bold" />
    </Pressable>
  )
}

function ConfigCell({
  field,
  savedValue,
  dirty,
  onPress,
  onInfo,
  onRevert,
}: {
  field: RefloatConfigField
  savedValue: TuneProfileFieldValue | undefined
  dirty: boolean
  onPress: () => void
  onInfo: () => void
  onRevert: () => void
}) {
  return (
    <Pressable style={[styles.cell, dirty && styles.cellDirty]} onPress={onPress}>
      <Pressable style={styles.cellInfoButton} onPress={onInfo}>
        <InfoIcon size={13} color="#64748b" weight="bold" />
      </Pressable>
      {dirty ? (
        <Pressable style={styles.cellRevertButton} onPress={onRevert}>
          <ArrowCounterClockwiseIcon size={13} color="#bae6fd" weight="bold" />
        </Pressable>
      ) : null}
      <Text style={styles.cellValue} numberOfLines={1} adjustsFontSizeToFit selectable>
        {formatValue(field.value)}
      </Text>
      {dirty && isDisplayableFieldValue(savedValue) ? (
        <Text style={styles.cellOldValue} numberOfLines={1}>
          was {formatValue(savedValue)}
        </Text>
      ) : null}
      {field.unit ? (
        <Text style={styles.cellUnit} numberOfLines={1} selectable>
          {field.unit}
        </Text>
      ) : null}
      <Text style={styles.cellLabel} numberOfLines={2}>
        {field.label}
      </Text>
    </Pressable>
  )
}

function FieldEditorSheet({
  editor,
  onCancel,
  onApply,
}: {
  editor: EditorState
  onCancel: () => void
  onApply: (value: number) => void
}) {
  const field = editor?.field
  const min = field?.min ?? 0
  const max = field?.max ?? 1
  const [draftValue, setDraftValue] = useState(min)
  const [draftText, setDraftText] = useState('')
  const [trackWidth, setTrackWidth] = useState(1)
  const [trackLeft, setTrackLeft] = useState(0)
  const trackRef = useRef<View>(null)
  const progress = field ? ((draftValue - min) / (max - min)) * 100 : 0

  useEffect(() => {
    if (!editor) return
    setDraftValue(editor.value)
    setDraftText(editor.text)
  }, [editor])

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      setTrackLeft(x)
      setTrackWidth(width > 0 ? width : 1)
    })
  }, [])

  const setValueFromLocalX = useCallback(
    (localX: number) => {
      if (!field || trackWidth <= 0) return
      const rawValue = min + (clamp(localX, 0, trackWidth) / trackWidth) * (max - min)
      const nextValue = snapFieldValue(rawValue, field)
      setDraftValue(nextValue)
      setDraftText(formatValue(nextValue))
    },
    [field, max, min, trackWidth],
  )

  const setValueFromPageX = useCallback(
    (pageX: number) => {
      setValueFromLocalX(pageX - trackLeft)
    },
    [setValueFromLocalX, trackLeft],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          measureTrack()
          setValueFromLocalX(event.nativeEvent.locationX)
        },
        onPanResponderMove: (event) => setValueFromPageX(event.nativeEvent.pageX),
      }),
    [measureTrack, setValueFromLocalX, setValueFromPageX],
  )

  return (
    <Modal visible={editor != null} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.sheetBackdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          {field ? (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleWrap}>
                  <Text style={styles.sheetTitle}>{field.label}</Text>
                  <Text style={styles.sheetSubtitle}>{field.id}</Text>
                </View>
                <Pressable style={styles.sheetIconButton} onPress={onCancel}>
                  <XIcon size={16} color="#cbd5e1" weight="bold" />
                </Pressable>
              </View>
              <Text style={styles.sheetInfo}>{fieldHelp(field)}</Text>
              <TextInput
                style={styles.editorInput}
                value={draftText}
                keyboardType="numeric"
                selectTextOnFocus
                onChangeText={(text) => {
                  const parsed = Number.parseFloat(text)
                  setDraftText(text)
                  if (field && Number.isFinite(parsed)) {
                    setDraftValue(snapFieldValue(parsed, field))
                  }
                }}
              />
              <View
                ref={trackRef}
                style={styles.editorTrack}
                onLayout={measureTrack}
                {...panResponder.panHandlers}
              >
                <View style={[styles.editorFill, { width: `${clamp(progress, 0, 100)}%` }]} />
                <View style={[styles.editorThumb, { left: `${clamp(progress, 0, 100)}%` }]} />
              </View>
              <View style={styles.editorRange}>
                <Text style={styles.editorRangeText}>
                  {formatValue(min)}
                  {field.unit ? ` ${field.unit}` : ''}
                </Text>
                <Text style={styles.editorRangeText}>
                  {formatValue(max)}
                  {field.unit ? ` ${field.unit}` : ''}
                </Text>
              </View>
              <View style={styles.sheetActions}>
                <Pressable style={styles.secondarySheetButton} onPress={onCancel}>
                  <Text style={styles.secondarySheetButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.primarySheetButton}
                  onPress={() => onApply(field ? snapFieldValue(draftValue, field) : draftValue)}
                >
                  <CheckIcon size={15} color="#020617" weight="bold" />
                  <Text style={styles.primarySheetButtonText}>Apply</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
function BasicSlider({ item, onInfo }: { item: BasicSliderItem; onInfo: () => void }) {
  const progress = item.value == null ? 0 : ((item.value - item.min) / (item.max - item.min)) * 100
  const roundedProgress = clamp(progress, 0, 100)

  return (
    <View style={[styles.basicSlider, item.value == null && styles.basicSliderMissing]}>
      <View style={styles.basicSliderHeader}>
        <View style={styles.basicSliderTitleWrap}>
          <Text style={styles.basicSliderLabel}>{item.label}</Text>
          <Text style={styles.basicSliderSource}>{item.source}</Text>
        </View>
        <View style={styles.basicSliderValueWrap}>
          <Text
            style={[styles.basicSliderValue, item.value == null && styles.basicSliderValueMissing]}
          >
            {formatSliderValue(item)}
          </Text>
          <Pressable style={styles.basicSliderInfoButton} onPress={onInfo}>
            <InfoIcon size={13} color="#64748b" weight="bold" />
          </Pressable>
        </View>
      </View>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${roundedProgress}%` }]} />
        {item.value != null ? (
          <View style={[styles.sliderThumb, { left: `${roundedProgress}%` }]} />
        ) : null}
      </View>
      <View style={styles.sliderRange}>
        <Text style={styles.sliderRangeText}>{item.min}</Text>
        <Text style={styles.sliderRangeText}>{item.max}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerButtonDisabled: {
    opacity: 0.7,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    color: '#9ca3af',
    fontSize: 15,
  },

  errorText: {
    color: '#fecaca',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#020617',
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#3f1111',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    color: '#fecaca',
    flex: 1,
  },
  dirtyBar: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    backgroundColor: '#0c2537',
    padding: 12,
    gap: 10,
  },
  dirtyBarText: {
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: '800',
  },
  dirtyBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryActionButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#172033',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
  },
  saveButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveButtonDisabled: {
    opacity: 0.72,
  },
  saveButtonText: {
    color: '#020617',
    fontSize: 12,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaBadge: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaBadgeDanger: {
    backgroundColor: '#7f1d1d',
    borderColor: '#991b1b',
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  metaTextDanger: {
    color: '#fee2e2',
  },
  group: {
    gap: 6,
  },
  basicList: {
    gap: 10,
  },
  basicSlider: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#172033',
    padding: 12,
    gap: 9,
  },
  basicSliderMissing: {
    opacity: 0.58,
  },
  basicSliderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  basicSliderTitleWrap: {
    flex: 1,
    gap: 2,
  },
  basicSliderLabel: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '800',
  },
  basicSliderSource: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  basicSliderValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  basicSliderValue: {
    color: '#e0f2fe',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  basicSliderValueMissing: {
    color: '#94a3b8',
    fontSize: 12,
  },
  basicSliderInfoButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0f172a',
    overflow: 'visible',
  },
  sliderFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
  },
  sliderThumb: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  sliderRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderRangeText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  groupTitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '50%',
    minHeight: 78,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  cellDirty: {
    backgroundColor: '#0c2537',
    borderRadius: 8,
  },
  cellInfoButton: {
    position: 'absolute',
    top: 9,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellRevertButton: {
    position: 'absolute',
    top: 37,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f3650',
  },
  cellValue: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '700',
    paddingRight: 26,
    fontVariant: ['tabular-nums'],
  },
  cellOldValue: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    paddingRight: 26,
  },
  cellUnit: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  cellLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.68)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    padding: 16,
    paddingBottom: 24,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitleWrap: {
    flex: 1,
    gap: 3,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  sheetSubtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  sheetIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  sheetInfo: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  editorTrack: {
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    overflow: 'visible',
  },
  editorFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
  },
  editorThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 3,
    borderColor: '#38bdf8',
  },
  editorRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editorRangeText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  editorInput: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondarySheetButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondarySheetButtonText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
  },
  primarySheetButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primarySheetButtonText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '900',
  },
})

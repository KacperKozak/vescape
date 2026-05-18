import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  CaretDownIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  InfoIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  WarningIcon,
  XIcon,
} from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getRefloatConfigSnapshot,
  type TuneProfile,
  type TuneHistoryEntry,
  type RefloatConfigField,
  type RefloatConfigGroup,
  type RefloatConfigSnapshot,
  type TuneProfileFieldValue,
} from 'vesc-ble'

import { InfoModal } from '@/components/InfoModal'
import { Placeholder } from '@/components/Placeholder'
import { useBoardStore } from '@/store/boardStore'
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
  modifiedManually: boolean
}

interface AppTuneFieldDefinition {
  id: string
  label: string
  unit: string | null
  min: number
  max: number
}

interface AppTuneGroupDefinition {
  id: string
  title: string
  fields: AppTuneFieldDefinition[]
}

const APP_TUNE_GROUPS: AppTuneGroupDefinition[] = [
  {
    id: 'general',
    title: 'General',
    fields: [
      { id: 'kp', label: 'Angle P', unit: null, min: 0, max: 50 },
      { id: 'kp2', label: 'Rate P', unit: null, min: 0, max: 5 },
      { id: 'kp_brake', label: 'Angle P (Braking)', unit: 'x', min: 0, max: 5 },
      { id: 'kp2_brake', label: 'Rate P (Braking)', unit: 'x', min: 0, max: 5 },
      { id: 'ki', label: 'Angle I', unit: null, min: 0, max: 1 },
      { id: 'ki_limit', label: 'I Term Limit', unit: 'A', min: 0, max: 100 },
      { id: 'mahony_kp', label: 'Pitch KP', unit: null, min: 0, max: 10 },
      { id: 'mahony_kp_roll', label: 'Roll KP', unit: null, min: 0, max: 10 },
    ],
  },
  {
    id: 'atr',
    title: 'ATR',
    fields: [
      { id: 'atr_strength_up', label: 'ATR Uphill Strength', unit: null, min: 0, max: 2 },
      { id: 'atr_strength_down', label: 'ATR Downhill Strength', unit: null, min: 0, max: 2 },
      { id: 'atr_threshold_up', label: 'Threshold Angle Up', unit: 'deg', min: 0, max: 20 },
      { id: 'atr_threshold_down', label: 'Threshold Angle Down', unit: 'deg', min: 0, max: 20 },
      { id: 'atr_speed_boost', label: 'Speed Boost', unit: '%', min: 0, max: 100 },
      { id: 'atr_angle_limit', label: 'Tiltback Angle Limit', unit: 'deg', min: 0, max: 20 },
      { id: 'atr_on_speed', label: 'Max Tiltback Speed', unit: 'deg/s', min: 0, max: 200 },
      { id: 'atr_off_speed', label: 'Max Tiltback Release Speed', unit: 'deg/s', min: 0, max: 200 },
      { id: 'atr_response_boost', label: 'Tiltback Response Boost', unit: 'x', min: 0, max: 5 },
      { id: 'atr_transition_boost', label: 'Tiltback Transition Boost', unit: 'x', min: 0, max: 5 },
      { id: 'atr_filter', label: 'Current Filter', unit: 'Hz', min: 0, max: 50 },
      {
        id: 'atr_amps_accel_ratio',
        label: 'Amps to Acceleration Ratio',
        unit: null,
        min: 0,
        max: 20,
      },
      {
        id: 'atr_amps_decel_ratio',
        label: 'Amps to Deceleration Ratio',
        unit: null,
        min: 0,
        max: 20,
      },
    ],
  },
  {
    id: 'turn_tiltback',
    title: 'Turn tiltback',
    fields: [
      { id: 'turntilt_strength', label: 'Strength', unit: null, min: 0, max: 15 },
      { id: 'turntilt_angle_limit', label: 'Tiltback Angle Limit', unit: 'deg', min: 0, max: 20 },
      {
        id: 'turntilt_start_angle',
        label: 'Turn Aggregate Threshold',
        unit: 'deg',
        min: 0,
        max: 90,
      },
      { id: 'turntilt_start_erpm', label: 'ERPM Threshold', unit: 'ERPM', min: 0, max: 30000 },
      { id: 'turntilt_speed', label: 'Max Tiltback Speed', unit: 'deg/s', min: 0, max: 200 },
      { id: 'turntilt_erpm_boost', label: 'Speed Boost %', unit: '%', min: 0, max: 100 },
      {
        id: 'turntilt_erpm_boost_end',
        label: 'Speed Boost Max ERPM',
        unit: 'ERPM',
        min: 0,
        max: 30000,
      },
      {
        id: 'turntilt_yaw_aggregate',
        label: 'Turn Aggregate Target',
        unit: 'deg',
        min: 0,
        max: 180,
      },
    ],
  },
  {
    id: 'torque_tiltback',
    title: 'Torque tiltback',
    fields: [
      { id: 'torquetilt_strength', label: 'Strength', unit: 'deg/A', min: 0, max: 0.5 },
      {
        id: 'torquetilt_strength_regen',
        label: 'Strength (Regen)',
        unit: 'deg/A',
        min: 0,
        max: 0.5,
      },
      {
        id: 'torquetilt_start_current',
        label: 'Start Current Threshold',
        unit: 'A',
        min: 0,
        max: 100,
      },
      { id: 'torquetilt_angle_limit', label: 'Tiltback Angle Limit', unit: 'deg', min: 0, max: 20 },
      { id: 'torquetilt_on_speed', label: 'Max Tiltback Speed', unit: 'deg/s', min: 0, max: 200 },
      {
        id: 'torquetilt_off_speed',
        label: 'Max Tiltback Release Speed',
        unit: 'deg/s',
        min: 0,
        max: 200,
      },
    ],
  },
  {
    id: 'brake',
    title: 'Brake',
    fields: [
      { id: 'braketilt_strength', label: 'Brake Tilt Strength', unit: null, min: 0, max: 5 },
      { id: 'braketilt_lingering', label: 'Brake Tilt Lingering', unit: null, min: 0, max: 10 },
    ],
  },
  {
    id: 'tiltback',
    title: 'Tiltback',
    fields: [
      { id: 'tiltback_constant', label: 'Constant Tiltback', unit: 'deg', min: -10, max: 20 },
      {
        id: 'tiltback_variable',
        label: 'Variable Tiltback Rate',
        unit: 'deg/1000 ERPM',
        min: 0,
        max: 10,
      },
      {
        id: 'tiltback_variable_max',
        label: 'Variable Tiltback Target',
        unit: 'deg',
        min: 0,
        max: 30,
      },
    ],
  },
]

const APP_TUNE_FIELD_BY_ID = new Map(
  APP_TUNE_GROUPS.flatMap((group) => group.fields.map((field) => [field.id, field])),
)

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

function formatProfileValue(value: TuneProfileFieldValue | undefined): string {
  return isDisplayableFieldValue(value) ? formatValue(value) : 'Missing'
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

function formatSliderValue(item: BasicSliderItem): string {
  if (item.value == null) return 'Missing'
  return Number.isInteger(item.value) ? item.value.toFixed(0) : item.value.toFixed(1)
}

function basicSlidersFromSnapshot(snapshot: RefloatConfigSnapshot): BasicSliderItem[] {
  const fieldMap = new Map<string, number | null>()
  for (const group of snapshot.groups) {
    for (const field of group.fields) {
      const v = typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : null
      fieldMap.set(field.id, v)
    }
  }

  return BASIC_SLIDER_FORMULAS.map((formula) => {
    const item = BASIC_SLIDER_ITEMS[formula.id]
    return {
      id: formula.id,
      label: item.label,
      value: formula.deriveSliderValue(fieldMap),
      min: item.min,
      max: item.max,
      step: item.step,
      source: item.source,
      info: item.info,
      modifiedManually: !formula.checkMatch(fieldMap),
    }
  })
}

const BASIC_SLIDER_ITEMS: Record<
  string,
  { label: string; min: number; max: number; step: number; source: string; info: string }
> = {
  aggressiveness: {
    label: 'Aggressiveness',
    min: -5,
    max: 10,
    step: 1,
    source: 'kp',
    info: 'Coordinates PID and Mahony filter values. Derived from kp - 20.',
  },
  noseStiffness: {
    label: 'Nose stiffness',
    min: 0,
    max: 10,
    step: 1,
    source: 'torquetilt_strength',
    info: 'Acceleration torque tiltback. Nose lift from positive output current.',
  },
  tailStiffness: {
    label: 'Tail stiffness',
    min: 0,
    max: 10,
    step: 1,
    source: 'torquetilt_strength_regen',
    info: 'Regen torque tiltback. Nose lowering from negative regen current.',
  },
  carveTilt: {
    label: 'Carve tilt',
    min: 0,
    max: 15,
    step: 1,
    source: 'turntilt_strength',
    info: 'Turn tiltback strength. Direct 1:1 mapping.',
  },
  brakeTilt: {
    label: 'Brake tilt',
    min: 0,
    max: 5,
    step: 1,
    source: 'braketilt_strength',
    info: 'Brake tiltback strength. Direct 1:1 mapping.',
  },
  atrIntensity: {
    label: 'ATR intensity',
    min: 0,
    max: 15,
    step: 1,
    source: 'atr_strength_up/down',
    info: 'ATR uphill and downhill strength, mapped from 0..2 to 0..15.',
  },
}

function interpolate(
  x: number,
  inputRange: [number, number],
  outputRange: [number, number],
): number {
  const [inMin, inMax] = inputRange
  const [outMin, outMax] = outputRange
  return outMin + ((x - inMin) / (inMax - inMin)) * (outMax - outMin)
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const EPSILON = 0.015

function nearEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON
}

interface BasicSliderFormula {
  id: string
  linkedFields: string[]
  deriveSliderValue: (fields: Map<string, number | null>) => number | null
  computeFieldValues: (sliderValue: number) => Record<string, number>
  checkMatch: (fields: Map<string, number | null>) => boolean
}

const BASIC_SLIDER_FORMULAS: BasicSliderFormula[] = [
  {
    id: 'aggressiveness',
    linkedFields: ['kp', 'kp2', 'ki', 'mahony_kp', 'mahony_kp_roll'],
    deriveSliderValue: (fields) => {
      const kp = fields.get('kp')
      return kp == null ? null : clamp(kp - 20, -5, 10)
    },
    computeFieldValues: (x) => ({
      kp: roundTo(interpolate(x, [-5, 10], [15, 30]), 0),
      kp2: roundTo(interpolate(x, [-5, 10], [0.4, 1.1]), 1),
      ki: roundTo(interpolate(x, [-5, 10], [0.015, 0.03]), 3),
      mahony_kp: roundTo(interpolate(x, [-5, 10], [2.2, 1.5]), 1),
      mahony_kp_roll: roundTo(interpolate(x, [-5, 10], [2.2, 1.5]), 1),
    }),
    checkMatch: (fields) => {
      const kp = fields.get('kp')
      if (kp == null) return true
      const x = clamp(kp - 20, -5, 10)
      const expected = {
        kp2: roundTo(interpolate(x, [-5, 10], [0.4, 1.1]), 1),
        ki: roundTo(interpolate(x, [-5, 10], [0.015, 0.03]), 3),
        mahony_kp: roundTo(interpolate(x, [-5, 10], [2.2, 1.5]), 1),
        mahony_kp_roll: roundTo(interpolate(x, [-5, 10], [2.2, 1.5]), 1),
      }
      return Object.entries(expected).every(([id, val]) => {
        const actual = fields.get(id)
        return actual == null || nearEqual(actual, val)
      })
    },
  },
  {
    id: 'noseStiffness',
    linkedFields: ['torquetilt_strength'],
    deriveSliderValue: (fields) => {
      const v = fields.get('torquetilt_strength')
      return v == null ? null : clamp(v / 0.03, 0, 10)
    },
    computeFieldValues: (x) => ({
      torquetilt_strength: roundTo(x * 0.03, 2),
    }),
    checkMatch: () => true,
  },
  {
    id: 'tailStiffness',
    linkedFields: ['torquetilt_strength_regen'],
    deriveSliderValue: (fields) => {
      const v = fields.get('torquetilt_strength_regen')
      return v == null ? null : clamp(v / 0.03, 0, 10)
    },
    computeFieldValues: (x) => ({
      torquetilt_strength_regen: roundTo(x * 0.03, 2),
    }),
    checkMatch: () => true,
  },
  {
    id: 'carveTilt',
    linkedFields: ['turntilt_strength'],
    deriveSliderValue: (fields) => {
      const v = fields.get('turntilt_strength')
      return v == null ? null : clamp(v, 0, 15)
    },
    computeFieldValues: (x) => ({
      turntilt_strength: x,
    }),
    checkMatch: () => true,
  },
  {
    id: 'brakeTilt',
    linkedFields: ['braketilt_strength'],
    deriveSliderValue: (fields) => {
      const v = fields.get('braketilt_strength')
      return v == null ? null : clamp(v, 0, 5)
    },
    computeFieldValues: (x) => ({
      braketilt_strength: x,
    }),
    checkMatch: () => true,
  },
  {
    id: 'atrIntensity',
    linkedFields: ['atr_strength_up', 'atr_strength_down'],
    deriveSliderValue: (fields) => {
      const up = fields.get('atr_strength_up')
      const down = fields.get('atr_strength_down')
      const stronger = up != null || down != null ? Math.max(up ?? 0, down ?? 0) : null
      return stronger == null ? null : clamp(interpolate(stronger, [0, 2], [0, 15]), 0, 15)
    },
    computeFieldValues: (x) => {
      const val = roundTo(interpolate(x, [0, 15], [0, 2]), 1)
      return { atr_strength_up: val, atr_strength_down: val }
    },
    checkMatch: (fields) => {
      const up = fields.get('atr_strength_up')
      const down = fields.get('atr_strength_down')
      if (up == null && down == null) return true
      return up != null && down != null && nearEqual(up, down)
    },
  },
]

const BASIC_SLIDER_FORMULA_BY_ID = new Map(BASIC_SLIDER_FORMULAS.map((f) => [f.id, f]))

function isDisplayableFieldValue(
  value: TuneProfileFieldValue | undefined,
): value is number | boolean | string {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
}

function groupsWithProfileValues(
  groups: RefloatConfigGroup[],
  fields: Record<string, TuneProfileFieldValue> | null,
): RefloatConfigGroup[] {
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const appField = APP_TUNE_FIELD_BY_ID.get(field.id)
      const profileValue = fields?.[field.id]
      return {
        ...field,
        label: appField?.label ?? field.label,
        unit: appField?.unit ?? field.unit,
        min: appField?.min ?? field.min,
        max: appField?.max ?? field.max,
        value: isDisplayableFieldValue(profileValue) ? profileValue : field.value,
      }
    }),
  }))
}

function snapshotFromTuneProfile(boardId: string, profile: TuneProfile): RefloatConfigSnapshot {
  return {
    capturedAt: Date.now(),
    boardId,
    canId: 0,
    schemaHash: 'app-tune-v1',
    rawConfigHash: '',
    rawConfigLength: 0,
    fwVersion: null,
    missingFieldIds: [],
    groups: APP_TUNE_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      fields: group.fields.flatMap((field) => {
        const value = profile.fields[field.id]
        if (!isDisplayableFieldValue(value)) return []
        return [
          {
            id: field.id,
            label: field.label,
            value,
            unit: field.unit,
            min: field.min,
            max: field.max,
          },
        ]
      }),
    })).filter((group) => group.fields.length > 0),
  }
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
  const selectedBoardId = useBoardStore((s) => s.activeBoardId)
  const boardsLoaded = useBoardStore((s) => s.hasLoaded)
  const loadBoards = useBoardStore((s) => s.load)
  const profiles = useTuneProfileStore((s) => s.profiles)
  const activeProfile = useTuneProfileStore((s) => s.activeProfile)
  const draftFields = useTuneProfileStore((s) => s.draftFields)
  const hasDirtyFields = useTuneProfileStore((s) => s.hasDirtyFields)
  const savingProfile = useTuneProfileStore((s) => s.saving)
  const profileError = useTuneProfileStore((s) => s.error)
  const boardDiff = useTuneProfileStore((s) => s.boardDiff)
  const hasBoardDiff = useTuneProfileStore((s) => s.hasBoardDiff)
  const loadProfiles = useTuneProfileStore((s) => s.loadProfiles)
  const setActiveProfile = useTuneProfileStore((s) => s.setActiveProfile)
  const storeCreateProfile = useTuneProfileStore((s) => s.createProfile)
  const storeRenameProfile = useTuneProfileStore((s) => s.renameProfile)
  const storeDeleteProfile = useTuneProfileStore((s) => s.deleteProfile)
  const loadHistory = useTuneProfileStore((s) => s.loadHistory)
  const rollbackToHistory = useTuneProfileStore((s) => s.rollbackToHistory)
  const setDraftField = useTuneProfileStore((s) => s.setDraftField)
  const setBoardSnapshot = useTuneProfileStore((s) => s.setBoardSnapshot)
  const getDirtyFields = useTuneProfileStore((s) => s.getDirtyFields)
  const revertField = useTuneProfileStore((s) => s.revertField)
  const acceptBoardField = useTuneProfileStore((s) => s.acceptBoardField)
  const acceptAllBoardValues = useTuneProfileStore((s) => s.acceptAllBoardValues)
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [renameModalProfile, setRenameModalProfile] = useState<TuneProfile | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createCloneFromId, setCreateCloneFromId] = useState<string | undefined>()
  const [historyEntries, setHistoryEntries] = useState<TuneHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const loadOnline = useCallback(async () => {
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await getRefloatConfigSnapshot()
      if (snapshot.boardId) {
        await loadProfiles(snapshot.boardId).catch(() => [])
      } else {
        clearProfiles()
      }
      setBoardSnapshot(snapshot)
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [clearProfiles, loadProfiles, setBoardSnapshot])

  const loadOffline = useCallback(
    async (boardId: string) => {
      setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
      try {
        const profiles = await loadProfiles(boardId)
        const profile = profiles[0]
        if (!profile) {
          throw new Error('No saved Tune Profile for this Board.')
        }
        const snapshot = snapshotFromTuneProfile(boardId, profile)
        setBoardSnapshot(null)
        setState({ phase: 'ready', snapshot, error: null })
      } catch (error) {
        setState((current) => ({
          phase: 'error',
          snapshot: current.snapshot,
          error: errorMessage(error),
        }))
      }
    },
    [loadProfiles, setBoardSnapshot],
  )

  useEffect(() => {
    if (!boardsLoaded) {
      void loadBoards()
    }
  }, [boardsLoaded, loadBoards])

  useEffect(() => {
    if (boardConnected) {
      void loadOnline()
    } else if (selectedBoardId) {
      void loadOffline(selectedBoardId)
    } else if (boardsLoaded) {
      clearProfiles()
      setBoardSnapshot(null)
      setState({ phase: 'loading', snapshot: null, error: null })
    }
  }, [
    boardConnected,
    boardsLoaded,
    clearProfiles,
    loadOffline,
    loadOnline,
    selectedBoardId,
    setBoardSnapshot,
  ])

  const openHistory = useCallback(async () => {
    if (!activeProfile) return
    const entries = await loadHistory(activeProfile.id)
    setHistoryEntries(entries)
    setHistoryOpen(true)
  }, [activeProfile, loadHistory])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: activeProfile ? `Tune - ${activeProfile.name}` : 'Tune',
      headerRight: () => (
        <View style={styles.headerActions}>
          {activeProfile ? (
            <Pressable style={styles.headerButton} onPress={() => void openHistory()}>
              <ClockCounterClockwiseIcon size={17} color="#cbd5e1" weight="bold" />
            </Pressable>
          ) : null}
          {boardConnected ? (
            <Pressable
              style={[
                styles.headerButton,
                state.phase === 'loading' && styles.headerButtonDisabled,
              ]}
              onPress={() => void loadOnline()}
              disabled={state.phase === 'loading'}
            >
              {state.phase === 'loading' ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <ArrowsClockwiseIcon size={17} color="#cbd5e1" weight="bold" />
              )}
            </Pressable>
          ) : null}
        </View>
      ),
    })
  }, [activeProfile, boardConnected, openHistory, loadOnline, navigation, state.phase])

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

  const handleCreateProfile = (cloneFromId?: string) => {
    setCreateCloneFromId(cloneFromId)
    setCreateModalOpen(true)
    setProfileMenuOpen(false)
  }

  const handleRenameProfile = (profile: TuneProfile) => {
    setRenameModalProfile(profile)
    setProfileMenuOpen(false)
  }

  const handleDeleteProfile = (profile: TuneProfile) => {
    Alert.alert('Delete Profile', `Delete "${profile.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void storeDeleteProfile(profile.id),
      },
    ])
    setProfileMenuOpen(false)
  }

  const handleRollback = (entryId: number) => {
    Alert.alert('Restore', 'Replace current profile fields with this snapshot?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: () => {
          void rollbackToHistory(entryId).then(() => setHistoryOpen(false))
        },
      },
    ])
  }

  const handleBasicSliderReset = (sliderId: string) => {
    const formula = BASIC_SLIDER_FORMULA_BY_ID.get(sliderId)
    if (!formula || !activeProfile) return
    const currentValue = formula.deriveSliderValue(
      new Map(
        Object.entries({ ...activeProfile.fields, ...draftFields })
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
          .map(([k, v]) => [k, v]),
      ),
    )
    if (currentValue == null) return
    const fieldValues = formula.computeFieldValues(Math.round(currentValue))
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      setDraftField(fieldId, value)
    }
  }

  const handleBasicSliderChange = (sliderId: string, newValue: number) => {
    const formula = BASIC_SLIDER_FORMULA_BY_ID.get(sliderId)
    if (!formula || !activeProfile) return
    const fieldValues = formula.computeFieldValues(newValue)
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      setDraftField(fieldId, value)
    }
  }

  const dirtyFields = getDirtyFields()
  const boardDiffByField = new Map(boardDiff.map((item) => [item.fieldId, item]))

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {!boardConnected && !selectedBoardId && boardsLoaded && !snapshot ? (
        <Placeholder
          icon={BluetoothSlashIcon}
          title="No board selected"
          description="Select a board to edit its saved Tune Profile"
        />
      ) : null}

      {state.phase === 'loading' && !snapshot && (boardConnected || selectedBoardId) ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>
            {boardConnected ? 'Reading board config...' : 'Loading saved tune profile...'}
          </Text>
        </View>
      ) : null}

      {state.phase === 'error' && !snapshot ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() =>
              boardConnected
                ? void loadOnline()
                : selectedBoardId
                  ? void loadOffline(selectedBoardId)
                  : undefined
            }
          >
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

          {hasBoardDiff ? (
            <View style={styles.boardDiffBar}>
              <View style={styles.boardDiffTextWrap}>
                <Text style={styles.boardDiffTitle}>Board config differs from your profile</Text>
                <Text style={styles.boardDiffText}>
                  {boardDiff.length} field{boardDiff.length === 1 ? '' : 's'} changed
                </Text>
              </View>
              <Pressable style={styles.boardDiffButton} onPress={acceptAllBoardValues}>
                <CheckIcon size={14} color="#022c22" weight="bold" />
                <Text style={styles.boardDiffButtonText}>Accept all</Text>
              </Pressable>
            </View>
          ) : null}

          {profiles.length > 0 ? (
            <View style={styles.profileSwitcherRow}>
              <Pressable
                style={styles.profileSwitcherButton}
                onPress={() => setProfileMenuOpen(true)}
              >
                <Text style={styles.profileSwitcherText} numberOfLines={1}>
                  {activeProfile?.name ?? 'Select profile'}
                </Text>
                <CaretDownIcon size={14} color="#94a3b8" weight="bold" />
              </Pressable>
              <Pressable
                style={styles.profileActionButton}
                onPress={() => handleCreateProfile(activeProfile?.id)}
              >
                <PlusIcon size={16} color="#38bdf8" weight="bold" />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.metaRow}>
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
              <Text style={styles.groupCount}>
                {activeProfile ? 'drag to adjust' : 'derived preview'}
              </Text>
            </View>
            <View style={styles.basicList}>
              {basicSliders.map((item) => (
                <BasicSlider
                  key={item.id}
                  item={item}
                  editable={activeProfile != null}
                  onInfo={() =>
                    showBadgeInfo(
                      item.label,
                      `${item.info}\n\nSource: ${item.source}\nRange: ${item.min} to ${item.max}, step ${item.step}`,
                    )
                  }
                  onReset={() => handleBasicSliderReset(item.id)}
                  onChange={(value) => handleBasicSliderChange(item.id, value)}
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
                    ? `${group.fields.length} profile values${
                        group.fields.some((field) => boardDiffByField.has(field.id))
                          ? ` - ${
                              group.fields.filter((field) => boardDiffByField.has(field.id)).length
                            } changed`
                          : ''
                      }`
                    : `${group.fields.length} read-only values`}
                </Text>
              </View>
              <View style={styles.grid}>
                {group.fields.map((field) => (
                  <ConfigCell
                    key={field.id}
                    field={field}
                    savedValue={activeProfile?.fields[field.id]}
                    boardValue={boardDiffByField.get(field.id)?.boardValue}
                    profileValue={boardDiffByField.get(field.id)?.profileValue}
                    dirty={Object.prototype.hasOwnProperty.call(dirtyFields, field.id)}
                    boardChanged={boardDiffByField.has(field.id)}
                    onPress={() => openFieldEditor(field)}
                    onInfo={() => showFieldInfo(field)}
                    onRevert={() => revertField(field.id)}
                    onAcceptBoard={() => acceptBoardField(field.id)}
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
      <ProfileMenuModal
        visible={profileMenuOpen}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        canDelete={profiles.length > 1}
        onSelect={(id) => {
          setActiveProfile(id)
          setProfileMenuOpen(false)
        }}
        onCreate={() => handleCreateProfile(activeProfile?.id)}
        onRename={handleRenameProfile}
        onDelete={handleDeleteProfile}
        onDismiss={() => setProfileMenuOpen(false)}
      />
      <TextPromptModal
        visible={createModalOpen}
        title="New Profile"
        placeholder="Profile name"
        initialValue=""
        confirmLabel="Create"
        onConfirm={(name) => {
          void storeCreateProfile(name, createCloneFromId)
          setCreateModalOpen(false)
        }}
        onDismiss={() => setCreateModalOpen(false)}
      />
      <RenameProfileModal
        profile={renameModalProfile}
        onRename={(name) => {
          if (renameModalProfile) void storeRenameProfile(renameModalProfile.id, name)
          setRenameModalProfile(null)
        }}
        onDismiss={() => setRenameModalProfile(null)}
      />
      <HistoryModal
        visible={historyOpen}
        entries={historyEntries}
        onRestore={handleRollback}
        onDismiss={() => setHistoryOpen(false)}
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
  boardValue,
  profileValue,
  dirty,
  boardChanged,
  onPress,
  onInfo,
  onRevert,
  onAcceptBoard,
}: {
  field: RefloatConfigField
  savedValue: TuneProfileFieldValue | undefined
  boardValue: TuneProfileFieldValue | undefined
  profileValue: TuneProfileFieldValue | undefined
  dirty: boolean
  boardChanged: boolean
  onPress: () => void
  onInfo: () => void
  onRevert: () => void
  onAcceptBoard: () => void
}) {
  return (
    <Pressable
      style={[styles.cell, dirty && styles.cellDirty, boardChanged && styles.cellBoardChanged]}
      onPress={onPress}
    >
      <Pressable style={styles.cellInfoButton} onPress={onInfo}>
        <InfoIcon size={13} color="#64748b" weight="bold" />
      </Pressable>
      {dirty ? (
        <Pressable style={styles.cellRevertButton} onPress={onRevert}>
          <ArrowCounterClockwiseIcon size={13} color="#bae6fd" weight="bold" />
        </Pressable>
      ) : null}
      {boardChanged && isDisplayableFieldValue(boardValue) ? (
        <Pressable style={styles.cellAcceptButton} onPress={onAcceptBoard}>
          <CheckIcon size={13} color="#bbf7d0" weight="bold" />
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
      {boardChanged ? (
        <Text style={styles.cellProfileValue} numberOfLines={1}>
          profile {formatProfileValue(profileValue)}
        </Text>
      ) : null}
      {boardChanged && isDisplayableFieldValue(boardValue) ? (
        <Text style={styles.cellBoardValue} numberOfLines={1}>
          board {formatValue(boardValue)}
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
function BasicSlider({
  item,
  editable,
  onInfo,
  onReset,
  onChange,
}: {
  item: BasicSliderItem
  editable: boolean
  onInfo: () => void
  onReset: () => void
  onChange: (value: number) => void
}) {
  const progress = item.value == null ? 0 : ((item.value - item.min) / (item.max - item.min)) * 100
  const roundedProgress = clamp(progress, 0, 100)
  const [trackWidth, setTrackWidth] = useState(1)
  const [trackLeft, setTrackLeft] = useState(0)
  const trackRef = useRef<View>(null)

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      setTrackLeft(x)
      setTrackWidth(width > 0 ? width : 1)
    })
  }, [])

  const valueFromX = useCallback(
    (localX: number) => {
      const ratio = clamp(localX, 0, trackWidth) / trackWidth
      return Math.round(item.min + ratio * (item.max - item.min))
    },
    [item.min, item.max, trackWidth],
  )

  const panResponder = useMemo(
    () =>
      editable
        ? PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (event) => {
              measureTrack()
              onChange(valueFromX(event.nativeEvent.locationX))
            },
            onPanResponderMove: (event) => {
              onChange(valueFromX(event.nativeEvent.pageX - trackLeft))
            },
          })
        : undefined,
    [editable, measureTrack, onChange, trackLeft, valueFromX],
  )

  return (
    <View style={[styles.basicSlider, item.value == null && styles.basicSliderMissing]}>
      <View style={styles.basicSliderHeader}>
        <View style={styles.basicSliderTitleWrap}>
          <Text style={styles.basicSliderLabel}>{item.label}</Text>
          {item.modifiedManually ? (
            <View style={styles.modifiedManuallyRow}>
              <WarningIcon size={11} color="#fbbf24" weight="fill" />
              <Text style={styles.modifiedManuallyText}>Modified manually</Text>
              <Pressable style={styles.resetButton} onPress={onReset}>
                <ArrowCounterClockwiseIcon size={11} color="#38bdf8" weight="bold" />
                <Text style={styles.resetButtonText}>Reset</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.basicSliderSource}>{item.source}</Text>
          )}
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
      <View
        ref={trackRef}
        style={styles.sliderTrack}
        onLayout={measureTrack}
        {...panResponder?.panHandlers}
      >
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

function ProfileMenuModal({
  visible,
  profiles,
  activeProfileId,
  canDelete,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDismiss,
}: {
  visible: boolean
  profiles: TuneProfile[]
  activeProfileId: string | null
  canDelete: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (profile: TuneProfile) => void
  onDelete: (profile: TuneProfile) => void
  onDismiss: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.sheetBackdrop} onPress={onDismiss}>
        <Pressable style={styles.profileMenu} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.profileMenuTitle}>Profiles</Text>
          <ScrollView style={styles.profileMenuList}>
            {profiles.map((profile) => (
              <View
                key={profile.id}
                style={[
                  styles.profileMenuItem,
                  profile.id === activeProfileId && styles.profileMenuItemActive,
                ]}
              >
                <Pressable
                  style={styles.profileMenuItemContent}
                  onPress={() => onSelect(profile.id)}
                >
                  <Text
                    style={[
                      styles.profileMenuItemText,
                      profile.id === activeProfileId && styles.profileMenuItemTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {profile.name}
                  </Text>
                  {profile.id === activeProfileId ? (
                    <CheckIcon size={14} color="#38bdf8" weight="bold" />
                  ) : null}
                </Pressable>
                <View style={styles.profileMenuItemActions}>
                  <Pressable style={styles.profileMenuIconBtn} onPress={() => onRename(profile)}>
                    <PencilSimpleIcon size={14} color="#94a3b8" weight="bold" />
                  </Pressable>
                  {canDelete ? (
                    <Pressable style={styles.profileMenuIconBtn} onPress={() => onDelete(profile)}>
                      <TrashIcon size={14} color="#f87171" weight="bold" />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.profileMenuCreateButton} onPress={onCreate}>
            <PlusIcon size={14} color="#38bdf8" weight="bold" />
            <Text style={styles.profileMenuCreateText}>New profile (clone current)</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  visible: boolean
  title: string
  placeholder?: string
  initialValue: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onDismiss: () => void
}) {
  const [text, setText] = useState(initialValue)

  useEffect(() => {
    if (visible) setText(initialValue)
  }, [visible, initialValue])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.sheetBackdrop} onPress={onDismiss}>
        <Pressable style={styles.renameModal} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.profileMenuTitle}>{title}</Text>
          <TextInput
            style={styles.editorInput}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#475569"
            autoFocus
            selectTextOnFocus
          />
          <View style={styles.sheetActions}>
            <Pressable style={styles.secondarySheetButton} onPress={onDismiss}>
              <Text style={styles.secondarySheetButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.primarySheetButton}
              onPress={() => text.trim() && onConfirm(text.trim())}
            >
              <CheckIcon size={15} color="#020617" weight="bold" />
              <Text style={styles.primarySheetButtonText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function RenameProfileModal({
  profile,
  onRename,
  onDismiss,
}: {
  profile: TuneProfile | null
  onRename: (name: string) => void
  onDismiss: () => void
}) {
  return (
    <TextPromptModal
      visible={profile != null}
      title="Rename Profile"
      initialValue={profile?.name ?? ''}
      confirmLabel="Rename"
      onConfirm={onRename}
      onDismiss={onDismiss}
    />
  )
}

function HistoryModal({
  visible,
  entries,
  onRestore,
  onDismiss,
}: {
  visible: boolean
  entries: TuneHistoryEntry[]
  onRestore: (entryId: number) => void
  onDismiss: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.sheetBackdrop} onPress={onDismiss}>
        <Pressable style={styles.historySheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>History</Text>
            <Pressable style={styles.sheetIconButton} onPress={onDismiss}>
              <XIcon size={16} color="#cbd5e1" weight="bold" />
            </Pressable>
          </View>
          {entries.length === 0 ? (
            <Text style={styles.historyEmpty}>No history entries yet.</Text>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(item) => String(item.id)}
              style={styles.historyList}
              renderItem={({ item }) => {
                const fieldCount = Object.keys(item.fields).length
                const date = new Date(item.createdAt)
                return (
                  <View style={styles.historyEntry}>
                    <View style={styles.historyEntryInfo}>
                      <Text style={styles.historyEntryDate}>
                        {date.toLocaleDateString()} {date.toLocaleTimeString()}
                      </Text>
                      <Text style={styles.historyEntryDetail}>
                        {fieldCount} field{fieldCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.historyRestoreButton}
                      onPress={() => onRestore(item.id)}
                    >
                      <ArrowCounterClockwiseIcon size={13} color="#38bdf8" weight="bold" />
                      <Text style={styles.historyRestoreText}>Restore</Text>
                    </Pressable>
                  </View>
                )
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
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
  boardDiffBar: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
    backgroundColor: '#082f26',
    padding: 12,
    gap: 10,
  },
  boardDiffTextWrap: {
    gap: 2,
  },
  boardDiffTitle: {
    color: '#dcfce7',
    fontSize: 13,
    fontWeight: '900',
  },
  boardDiffText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '700',
  },
  boardDiffButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#4ade80',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  boardDiffButtonText: {
    color: '#022c22',
    fontSize: 12,
    fontWeight: '900',
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
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    overflow: 'visible',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
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
    minHeight: 92,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  cellDirty: {
    backgroundColor: '#0c2537',
    borderRadius: 8,
  },
  cellBoardChanged: {
    backgroundColor: '#082f26',
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
  cellAcceptButton: {
    position: 'absolute',
    top: 65,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14532d',
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
  cellProfileValue: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
    paddingRight: 26,
  },
  cellBoardValue: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '900',
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
  profileSwitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileSwitcherButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    gap: 8,
  },
  profileSwitcherText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  profileActionButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  profileMenu: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginHorizontal: 32,
    marginTop: 120,
    maxHeight: 400,
    padding: 16,
    gap: 12,
  },
  profileMenuTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  profileMenuList: {
    maxHeight: 250,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 44,
  },
  profileMenuItemActive: {
    backgroundColor: '#0c2537',
  },
  profileMenuItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileMenuItemText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  profileMenuItemTextActive: {
    color: '#38bdf8',
  },
  profileMenuItemActions: {
    flexDirection: 'row',
    gap: 2,
  },
  profileMenuIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMenuCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
  },
  profileMenuCreateText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
  },
  renameModal: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginHorizontal: 32,
    marginTop: 160,
    padding: 16,
    gap: 14,
  },
  modifiedManuallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modifiedManuallyText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#0c2537',
  },
  resetButtonText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
  },
  historySheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    padding: 16,
    paddingBottom: 24,
    maxHeight: '70%',
    marginTop: 'auto',
    gap: 12,
  },
  historyEmpty: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  historyList: {
    flexGrow: 0,
  },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 10,
  },
  historyEntryInfo: {
    flex: 1,
    gap: 2,
  },
  historyEntryDate: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  historyEntryDetail: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  historyRestoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0c2537',
    borderWidth: 1,
    borderColor: '#164e63',
  },
  historyRestoreText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
})

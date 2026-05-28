import { useCallback, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { RadioactiveIcon, WaveformIcon } from 'phosphor-react-native'

import { SoundPicker } from '@/components/ui/forms/SoundPicker'

import { TuneDial } from '@/components/ui/tune/TuneDial'
import { telemetryByControlId } from '@/constants/telemetry'
import { theme } from '@/constants/theme'
import { type AlertRule, type AlertSoundType } from '@/store/alertsStore'
import { type AlertPreset, type AlertPresetCategory, getAlertPresets } from 'vesc-ble'

type AlertTab = 'single' | 'geiger'

function getPresetsForCategory(category: AlertPresetCategory): AlertPreset[] {
  return getAlertPresets().filter((p) => p.category === category)
}

function getAlertDialConfig(controlId: string) {
  const metric = telemetryByControlId[controlId]
  if (!metric) return { min: 0, max: 100, step: 1, format: (v: number) => String(v), unit: '' }
  const step =
    metric.decimals === 0 ? 1 : Number(Math.pow(10, -metric.decimals).toFixed(metric.decimals))
  return {
    min: metric.chartRange.min,
    max: metric.chartRange.max,
    step,
    format: metric.format,
    unit: metric.unit,
  }
}

interface AlertFormModalProps {
  visible: boolean
  controlId: string
  unit: string
  editRule: AlertRule | null
  onClose(): void
  onSave(threshold: number, thresholdMax: number | null, soundType: AlertSoundType): void
}

function getEditFormDefaults(
  editRule: AlertRule,
  dialConfig: ReturnType<typeof getAlertDialConfig>,
) {
  return {
    tab: (editRule.thresholdMax != null ? 'geiger' : 'single') as AlertTab,
    threshold: editRule.threshold,
    thresholdMax: editRule.thresholdMax ?? dialConfig.max,
    soundType: editRule.soundType,
  }
}

function getNewFormDefaults(
  dialConfig: ReturnType<typeof getAlertDialConfig>,
  defaultSoundType: AlertSoundType,
) {
  const mid =
    Math.round(((dialConfig.min + dialConfig.max) / 2) * (1 / dialConfig.step)) * dialConfig.step
  return {
    tab: 'single' as AlertTab,
    threshold: mid,
    thresholdMax:
      Math.round(
        (dialConfig.min + (dialConfig.max - dialConfig.min) * 0.75) * (1 / dialConfig.step),
      ) * dialConfig.step,
    soundType: defaultSoundType,
  }
}

export function AlertFormModal({
  visible,
  controlId,
  unit,
  editRule,
  onClose,
  onSave,
}: AlertFormModalProps) {
  const isEditing = editRule != null
  const dialConfig = useMemo(() => getAlertDialConfig(controlId), [controlId])

  const singlePresets = useMemo(() => getPresetsForCategory('single'), [])
  const geigerPresets = useMemo(() => getPresetsForCategory('geiger'), [])
  const defaultSoundType: AlertSoundType = singlePresets[0]?.uri ?? 'preset:beep'

  const [tab, setTab] = useState<AlertTab>('single')
  const [threshold, setThreshold] = useState(dialConfig.min)
  const [thresholdMax, setThresholdMax] = useState(dialConfig.max)
  const [soundType, setSoundType] = useState<AlertSoundType>(defaultSoundType)
  const [prevVisible, setPrevVisible] = useState(visible)

  if (visible && !prevVisible) {
    const defaults = editRule
      ? getEditFormDefaults(editRule, dialConfig)
      : getNewFormDefaults(dialConfig, defaultSoundType)
    setTab(defaults.tab)
    setThreshold(defaults.threshold)
    setThresholdMax(defaults.thresholdMax)
    setSoundType(defaults.soundType)
  }
  if (visible !== prevVisible) {
    setPrevVisible(visible)
  }

  const handleTabSwitch = useCallback(
    (next: AlertTab) => {
      setTab(next)
      const presets = next === 'single' ? singlePresets : geigerPresets
      setSoundType(presets[0]?.uri ?? 'preset:beep')
    },
    [singlePresets, geigerPresets],
  )

  const handleSave = useCallback(() => {
    onSave(threshold, tab === 'geiger' ? thresholdMax : null, soundType)
  }, [tab, threshold, thresholdMax, soundType, onSave])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modal}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalContent}
          >
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Alert' : 'Add Alert'}</Text>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, tab === 'single' && styles.tabActive]}
                onPress={() => handleTabSwitch('single')}
              >
                <WaveformIcon
                  size={14}
                  color={tab === 'single' ? theme.neutral.textPrimary : theme.neutral.textMuted}
                  weight="fill"
                />
                <Text style={[styles.tabText, tab === 'single' && styles.tabTextActive]}>
                  Single
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'geiger' && styles.tabActive]}
                onPress={() => handleTabSwitch('geiger')}
              >
                <RadioactiveIcon
                  size={14}
                  color={tab === 'geiger' ? theme.neutral.textPrimary : theme.neutral.textMuted}
                  weight="fill"
                />
                <Text style={[styles.tabText, tab === 'geiger' && styles.tabTextActive]}>
                  Geiger
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dialField}>
              <Text style={styles.fieldLabel}>THRESHOLD</Text>
              <Text style={styles.dialValue}>
                {dialConfig.format(threshold)}
                {unit ? ` ${unit}` : ''}
              </Text>
              <TuneDial
                value={threshold}
                previousValue={editRule?.threshold}
                min={dialConfig.min}
                max={dialConfig.max}
                step={dialConfig.step}
                onValueChange={setThreshold}
              />
            </View>

            {tab === 'geiger' && (
              <View style={styles.dialField}>
                <Text style={styles.fieldLabel}>THRESHOLD MAX</Text>
                <Text style={styles.dialValue}>
                  {dialConfig.format(thresholdMax)}
                  {unit ? ` ${unit}` : ''}
                </Text>
                <TuneDial
                  value={thresholdMax}
                  previousValue={editRule?.thresholdMax ?? undefined}
                  min={dialConfig.min}
                  max={dialConfig.max}
                  step={dialConfig.step}
                  onValueChange={setThresholdMax}
                />
              </View>
            )}

            <SoundPicker
              presets={tab === 'single' ? singlePresets : geigerPresets}
              selected={soundType}
              onSelect={setSoundType}
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>{isEditing ? 'Save' : 'Add'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.neutral.modalBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: theme.neutral.surfaceDeep,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    width: '100%',
    maxWidth: 340,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.neutral.surface,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: theme.neutral.surfaceDeep,
  },
  tabActive: {
    backgroundColor: theme.wheel.bg,
  },
  tabText: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: theme.neutral.textPrimary,
  },
  dialField: {
    gap: 6,
  },
  fieldLabel: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dialValue: {
    color: theme.neutral.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  saveButton: {
    backgroundColor: theme.wheel.color,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: theme.wheel.bg,
    fontSize: 15,
    fontWeight: '700',
  },
})

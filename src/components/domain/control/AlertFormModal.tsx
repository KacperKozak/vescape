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
import { ChatTextIcon, RadioactiveIcon, WaveformIcon } from 'phosphor-react-native'

import { Input } from '@/components/ui/forms/Input'
import { SoundPicker } from '@/components/ui/forms/SoundPicker'

import { TuneDial } from '@/components/ui/tune/TuneDial'
import { telemetryByControlId } from '@/constants/telemetry'
import { theme } from '@/constants/theme'
import { type DerivedBatteryConfig } from '@/lib/battery/types'
import { type AlertRule, type AlertSoundType } from '@/store/alertsStore'
import {
  type AlertPreset,
  type AlertPresetCategory,
  getAlertPresets,
  previewAlertSound,
} from 'vesc-ble'

type AlertTab = 'single' | 'geiger' | 'message'

function getPresetsForCategory(category: AlertPresetCategory): AlertPreset[] {
  return getAlertPresets().filter((p) => p.category === category)
}

function getDefaultMessageTemplate(
  controlId: string,
  batteryConfig: DerivedBatteryConfig | null,
): string {
  if (controlId === 'battery') {
    return batteryConfig ? 'Battery {percent}%' : 'Battery {voltage}V'
  }
  const metric = telemetryByControlId[controlId]
  if (metric) return `${metric.label} {value} {unit}`
  return '{value} {unit}'
}

function getMessagePlaceholders(
  controlId: string,
  batteryConfig: DerivedBatteryConfig | null,
): string[] {
  const base = ['{value}', '{threshold}', '{unit}']
  if (controlId === 'battery') {
    return [...base, batteryConfig ? '{percent}' : '{voltage}']
  }
  return base
}

function renderPreviewTemplate(
  template: string,
  threshold: number,
  unit: string,
  dialConfig: ReturnType<typeof getAlertDialConfig>,
  controlId: string,
  batteryConfig: DerivedBatteryConfig | null,
): string {
  const formatted = dialConfig.format(threshold)
  let result = template
    .replace(/\{value\}/g, formatted)
    .replace(/\{threshold\}/g, formatted)
    .replace(/\{unit\}/g, unit)
  if (controlId === 'battery') {
    if (batteryConfig) {
      result = result.replace(/\{percent\}/g, formatted)
    } else {
      result = result.replace(/\{voltage\}/g, formatted)
    }
  }
  return result
}

function getAlertDialConfig(controlId: string, batteryConfig: DerivedBatteryConfig | null) {
  if (controlId === 'battery' && batteryConfig) {
    return {
      min: 0,
      max: 100,
      step: 1,
      format: (v: number) => `${Math.round(v)}`,
      unit: '%',
    }
  }
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
  batteryConfig: DerivedBatteryConfig | null
  onClose(): void
  onSave(threshold: number, thresholdMax: number | null, soundType: AlertSoundType): void
}

function getEditFormDefaults(
  editRule: AlertRule,
  dialConfig: ReturnType<typeof getAlertDialConfig>,
  batteryConfig: DerivedBatteryConfig | null,
) {
  const isTts = editRule.soundType.startsWith('tts:')
  return {
    tab: (isTts ? 'message' : editRule.thresholdMax != null ? 'geiger' : 'single') as AlertTab,
    threshold: editRule.threshold,
    thresholdMax: editRule.thresholdMax ?? dialConfig.max,
    soundType: editRule.soundType,
    messageTemplate: isTts
      ? editRule.soundType.slice(4)
      : getDefaultMessageTemplate(editRule.controlId, batteryConfig),
  }
}

function getNewFormDefaults(
  dialConfig: ReturnType<typeof getAlertDialConfig>,
  defaultSoundType: AlertSoundType,
  controlId: string,
  batteryConfig: DerivedBatteryConfig | null,
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
    messageTemplate: getDefaultMessageTemplate(controlId, batteryConfig),
  }
}

export function AlertFormModal({
  visible,
  controlId,
  unit,
  editRule,
  batteryConfig,
  onClose,
  onSave,
}: AlertFormModalProps) {
  const isEditing = editRule != null
  const dialConfig = useMemo(
    () => getAlertDialConfig(controlId, batteryConfig),
    [controlId, batteryConfig],
  )

  const singlePresets = useMemo(() => getPresetsForCategory('single'), [])
  const geigerPresets = useMemo(() => getPresetsForCategory('geiger'), [])
  const defaultSoundType: AlertSoundType = singlePresets[0]?.uri ?? 'preset:beep'

  const [tab, setTab] = useState<AlertTab>('single')
  const [threshold, setThreshold] = useState(dialConfig.min)
  const [thresholdMax, setThresholdMax] = useState(dialConfig.max)
  const [soundType, setSoundType] = useState<AlertSoundType>(defaultSoundType)
  const [messageTemplate, setMessageTemplate] = useState(
    getDefaultMessageTemplate(controlId, batteryConfig),
  )
  const [prevVisible, setPrevVisible] = useState(visible)

  if (visible && !prevVisible) {
    const defaults = editRule
      ? getEditFormDefaults(editRule, dialConfig, batteryConfig)
      : getNewFormDefaults(dialConfig, defaultSoundType, controlId, batteryConfig)
    setTab(defaults.tab)
    setThreshold(defaults.threshold)
    setThresholdMax(defaults.thresholdMax)
    setSoundType(defaults.soundType)
    setMessageTemplate(defaults.messageTemplate)
  }
  if (visible !== prevVisible) {
    setPrevVisible(visible)
  }

  const handleTabSwitch = useCallback(
    (next: AlertTab) => {
      setTab(next)
      if (next === 'message') {
        setMessageTemplate(getDefaultMessageTemplate(controlId, batteryConfig))
      } else {
        const presets = next === 'single' ? singlePresets : geigerPresets
        setSoundType(presets[0]?.uri ?? 'preset:beep')
      }
    },
    [singlePresets, geigerPresets, controlId, batteryConfig],
  )

  const handleSave = useCallback(() => {
    const finalSoundType = tab === 'message' ? `tts:${messageTemplate}` : soundType
    onSave(threshold, tab === 'geiger' ? thresholdMax : null, finalSoundType)
  }, [tab, threshold, thresholdMax, soundType, messageTemplate, onSave])

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
                  Alert
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
              <TouchableOpacity
                style={[styles.tab, tab === 'message' && styles.tabActive]}
                onPress={() => handleTabSwitch('message')}
              >
                <ChatTextIcon
                  size={14}
                  color={tab === 'message' ? theme.neutral.textPrimary : theme.neutral.textMuted}
                  weight="fill"
                />
                <Text style={[styles.tabText, tab === 'message' && styles.tabTextActive]}>
                  Message
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dialField}>
              <Text style={styles.fieldLabel}>THRESHOLD</Text>
              <TuneDial
                value={threshold}
                previousValue={editRule?.threshold ?? undefined}
                min={dialConfig.min}
                max={dialConfig.max}
                step={dialConfig.step}
                unit={dialConfig.unit}
                indicatorGlow={tab === 'geiger' ? 'right' : undefined}
                valueChangeMode="commit"
                onValueChange={setThreshold}
              />
            </View>

            {tab === 'geiger' && (
              <View style={styles.dialField}>
                <Text style={styles.fieldLabel}>THRESHOLD MAX</Text>
                <TuneDial
                  value={thresholdMax}
                  previousValue={editRule?.thresholdMax ?? undefined}
                  min={dialConfig.min}
                  max={dialConfig.max}
                  step={dialConfig.step}
                  unit={dialConfig.unit}
                  indicatorGlow="left"
                  valueChangeMode="commit"
                  onValueChange={setThresholdMax}
                />
              </View>
            )}

            {tab === 'message' ? (
              <View style={styles.messageField}>
                <Text style={styles.fieldLabel}>TEMPLATE</Text>
                <Input
                  value={messageTemplate}
                  onChangeText={setMessageTemplate}
                  multiline
                  placeholder="e.g. Speed {value} {unit}"
                  placeholderTextColor={theme.neutral.textDim}
                  style={styles.templateInput}
                />
                <View style={styles.placeholderRow}>
                  {getMessagePlaceholders(controlId, batteryConfig).map((ph) => (
                    <TouchableOpacity
                      key={ph}
                      style={styles.placeholderChip}
                      onPress={() => setMessageTemplate((t) => t + ph)}
                    >
                      <Text style={styles.placeholderChipText}>{ph}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.previewButton}
                  onPress={() =>
                    previewAlertSound(
                      `tts:${renderPreviewTemplate(messageTemplate, threshold, unit, dialConfig, controlId, batteryConfig)}`,
                    )
                  }
                >
                  <Text style={styles.previewButtonText}>Preview</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <SoundPicker
                presets={tab === 'single' ? singlePresets : geigerPresets}
                selected={soundType}
                onSelect={setSoundType}
              />
            )}

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
    backgroundColor: theme.neutral.surface,
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
  messageField: {
    gap: 8,
  },
  templateInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  placeholderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  placeholderChip: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  placeholderChipText: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  previewButton: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  previewButtonText: {
    color: theme.neutral.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
})

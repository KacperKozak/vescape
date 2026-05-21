import { useNavigation } from 'expo-router'
import {
  PlusIcon,
  RadioactiveIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TrashIcon,
  WaveformIcon,
} from 'phosphor-react-native'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { ConfirmModal } from '@/components/ConfirmModal'
import { TuneDial } from '@/components/tune/TuneDial'
import { telemetryByControlId } from '@/constants/telemetry'
import { theme } from '@/constants/theme'
import { type AlertRule, type AlertSoundType, useAlertsStore } from '@/store/alertsStore'
import {
  type AlertPreset,
  type AlertPresetCategory,
  getAlertPresets,
  previewAlertSound,
} from 'vesc-ble'

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

interface Props {
  title: string
  children: ReactNode
  controlId?: string
  unit?: string
  alertControls?: AlertControl[]
}

interface AlertControl {
  label: string
  controlId: string
  unit: string
}

function SoundPicker({
  presets,
  selected,
  onSelect,
}: {
  presets: AlertPreset[]
  selected: string
  onSelect: (uri: string) => void
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>SOUND</Text>
      <View style={styles.soundRow}>
        {presets.map((preset) => {
          const active = selected === preset.uri
          return (
            <TouchableOpacity
              key={preset.uri}
              style={[styles.soundOption, active && styles.soundOptionActive]}
              onPress={() => {
                onSelect(preset.uri)
                previewAlertSound(preset.uri)
              }}
            >
              <Text style={[styles.soundOptionText, active && styles.soundOptionTextActive]}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

interface AlertFormModalProps {
  visible: boolean
  controlId: string
  unit: string
  editRule: AlertRule | null
  onClose(): void
  onSave(threshold: number, thresholdMax: number | null, soundType: AlertSoundType): void
}

function AlertFormModal({
  visible,
  controlId,
  unit,
  editRule,
  onClose,
  onSave,
}: AlertFormModalProps) {
  const isEditing = editRule != null
  const dialConfig = useMemo(() => getAlertDialConfig(controlId), [controlId])

  const [tab, setTab] = useState<AlertTab>('single')
  const [threshold, setThreshold] = useState(dialConfig.min)
  const [thresholdMax, setThresholdMax] = useState(dialConfig.max)
  const singlePresets = useMemo(() => getPresetsForCategory('single'), [])
  const geigerPresets = useMemo(() => getPresetsForCategory('geiger'), [])
  const [soundType, setSoundType] = useState<AlertSoundType>(singlePresets[0]?.uri ?? 'preset:beep')

  useEffect(() => {
    if (!visible) return
    if (editRule) {
      setTab(editRule.thresholdMax != null ? 'geiger' : 'single')
      setThreshold(editRule.threshold)
      setThresholdMax(editRule.thresholdMax ?? dialConfig.max)
      setSoundType(editRule.soundType)
    } else {
      setTab('single')
      const mid =
        Math.round(((dialConfig.min + dialConfig.max) / 2) * (1 / dialConfig.step)) *
        dialConfig.step
      setThreshold(mid)
      setThresholdMax(
        Math.round(
          (dialConfig.min + (dialConfig.max - dialConfig.min) * 0.75) * (1 / dialConfig.step),
        ) * dialConfig.step,
      )
      setSoundType(singlePresets[0]?.uri ?? 'preset:beep')
    }
  }, [visible, editRule, dialConfig, singlePresets])

  const handleTabSwitch = useCallback(
    (next: AlertTab) => {
      setTab(next)
      const presets = next === 'single' ? singlePresets : geigerPresets
      setSoundType(presets[0]?.uri ?? 'preset:beep')
    },
    [singlePresets, geigerPresets],
  )

  const handleSave = useCallback(() => {
    if (tab === 'geiger') {
      onSave(threshold, thresholdMax, soundType)
    } else {
      onSave(threshold, null, soundType)
    }
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
                  color={tab === 'single' ? '#f1f5f9' : '#64748b'}
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
                  color={tab === 'geiger' ? '#f1f5f9' : '#64748b'}
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

interface AlertsSectionProps {
  controlId: string
  unit: string
}

function AlertsSection({ controlId, unit }: AlertsSectionProps) {
  const allRules = useAlertsStore((s) => s.rules)
  const rules = useMemo(
    () => allRules.filter((rule) => rule.controlId === controlId),
    [allRules, controlId],
  )
  const add = useAlertsStore((s) => s.add)
  const update = useAlertsStore((s) => s.update)
  const toggle = useAlertsStore((s) => s.toggle)
  const remove = useAlertsStore((s) => s.remove)

  const [formVisible, setFormVisible] = useState(false)
  const [editRule, setEditRule] = useState<AlertRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null)

  if (controlId === 'state') {
    return <Text style={styles.stateNote}>Fault alerts are always active.</Text>
  }

  function handleEdit(rule: AlertRule) {
    setEditRule(rule)
    setFormVisible(true)
  }

  function handleAdd() {
    setEditRule(null)
    setFormVisible(true)
  }

  function handleSave(threshold: number, thresholdMax: number | null, soundType: AlertSoundType) {
    if (editRule) {
      update(editRule.id, threshold, thresholdMax, soundType)
    } else {
      add(controlId, threshold, thresholdMax, soundType)
    }
    setFormVisible(false)
    setEditRule(null)
  }

  function handleCloseForm() {
    setFormVisible(false)
    setEditRule(null)
  }

  return (
    <>
      {rules.map((rule) => {
        const isGeiger = rule.thresholdMax != null
        const TypeIcon = isGeiger ? RadioactiveIcon : WaveformIcon

        return (
          <TouchableOpacity
            key={rule.id}
            style={styles.ruleRow}
            onPress={() => handleEdit(rule)}
            activeOpacity={0.7}
          >
            <View style={[styles.ruleTypeIcon, rule.enabled && styles.ruleTypeIconActive]}>
              <TypeIcon
                size={16}
                color={rule.enabled ? theme.wheel.color : '#475569'}
                weight="fill"
              />
            </View>

            <View style={styles.ruleContent}>
              <Text style={[styles.ruleThreshold, !rule.enabled && styles.ruleTextDisabled]}>
                {isGeiger
                  ? `${rule.threshold} – ${rule.thresholdMax}${unit ? ` ${unit}` : ''}`
                  : `${rule.threshold}${unit ? ` ${unit}` : ''}`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation()
                void toggle(rule.id)
              }}
              hitSlop={8}
              style={styles.ruleAction}
            >
              {rule.enabled ? (
                <SpeakerHighIcon size={16} color={theme.wheel.color} />
              ) : (
                <SpeakerSlashIcon size={16} color="#475569" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation()
                setDeleteTarget(rule)
              }}
              hitSlop={8}
              style={styles.ruleAction}
            >
              <TrashIcon size={15} color={theme.error.color} />
            </TouchableOpacity>
          </TouchableOpacity>
        )
      })}

      <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
        <PlusIcon size={14} color={theme.wheel.color} weight="fill" />
        <Text style={styles.addButtonText}>Add Rule</Text>
      </TouchableOpacity>

      <AlertFormModal
        visible={formVisible}
        controlId={controlId}
        unit={unit}
        editRule={editRule}
        onClose={handleCloseForm}
        onSave={handleSave}
      />

      <ConfirmModal
        visible={deleteTarget != null}
        title="Delete Alert"
        message="Remove this alert rule? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) void remove(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

export function ControlDetailLayout({
  title,
  children,
  controlId,
  unit = '',
  alertControls,
}: Props) {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ title })
  }, [title, navigation])

  const controls = alertControls ?? (controlId ? [{ label: title, controlId, unit }] : [])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {children}
      <View style={styles.alertsSection}>
        <Text style={styles.sectionLabel}>ALERTS</Text>
        {controls.length > 0 ? (
          controls.map((control, index) => (
            <View key={control.controlId} style={styles.alertControl}>
              {controls.length > 1 ? (
                <Text style={[styles.alertControlLabel, index > 0 && styles.alertControlLabelGap]}>
                  {control.label.toUpperCase()}
                </Text>
              ) : null}
              <AlertsSection controlId={control.controlId} unit={control.unit} />
            </View>
          ))
        ) : (
          <Text style={styles.placeholder}>No alert configuration available.</Text>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  alertsSection: {
    gap: 10,
    paddingTop: 8,
  },
  alertControl: {
    gap: 8,
  },
  alertControlLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  alertControlLabelGap: {
    marginTop: 8,
  },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  placeholder: {
    color: '#475569',
    fontSize: 14,
  },
  stateNote: {
    color: '#475569',
    fontSize: 14,
  },

  // Rule rows
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  ruleTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  ruleTypeIconActive: {
    backgroundColor: theme.wheel.bg,
  },
  ruleContent: {
    flex: 1,
  },
  ruleThreshold: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '500',
  },
  ruleTextDisabled: {
    color: '#475569',
  },
  ruleAction: {
    padding: 6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  addButtonText: {
    color: theme.wheel.color,
    fontSize: 14,
    fontWeight: '500',
  },

  // Modal — matches ConfirmModal visual language
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#131c2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    width: '100%',
    maxWidth: 340,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
  },
  tabActive: {
    backgroundColor: theme.wheel.bg,
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f1f5f9',
  },

  // TuneDial fields
  dialField: {
    gap: 6,
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dialValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Sound picker
  formField: {
    gap: 6,
  },
  soundRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soundOption: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
  },
  soundOptionActive: {
    borderColor: theme.wheel.color,
    backgroundColor: theme.wheel.bg,
  },
  soundOptionText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  soundOptionTextActive: {
    color: '#f1f5f9',
  },

  // Save button
  saveButton: {
    backgroundColor: theme.wheel.color,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: '#0c2a3f',
    fontSize: 15,
    fontWeight: '700',
  },
})

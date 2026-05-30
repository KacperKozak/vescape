import { useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
  ChatTextIcon,
  PlusIcon,
  RadioactiveIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TrashIcon,
  WaveformIcon,
} from 'phosphor-react-native'

import { AlertFormModal } from './AlertFormModal'

import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { theme } from '@/constants/theme'
import { deriveBatteryConfig, voltageToPercent } from '@/lib/battery'
import { type DerivedBatteryConfig } from '@/lib/battery/types'
import { type AlertRule, type AlertSoundType, useAlertsStore } from '@/store/alertsStore'
import { useBoardStore } from '@/store/boardStore'

interface AlertsSectionProps {
  controlId: string
  unit: string
}

export function AlertsSection({ controlId, unit }: AlertsSectionProps) {
  const allRules = useAlertsStore((s) => s.rules)
  const rules = useMemo(
    () => allRules.filter((rule) => rule.controlId === controlId),
    [allRules, controlId],
  )
  const add = useAlertsStore((s) => s.add)
  const update = useAlertsStore((s) => s.update)
  const toggle = useAlertsStore((s) => s.toggle)
  const remove = useAlertsStore((s) => s.remove)
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const batteryConfig: DerivedBatteryConfig | null = useMemo(() => {
    if (controlId !== 'battery') return null
    const derived = deriveBatteryConfig(board?.batteryConfig ?? null)
    return derived.warning == null ? derived : null
  }, [controlId, board?.batteryConfig])

  const [formVisible, setFormVisible] = useState(false)
  const [editRule, setEditRule] = useState<AlertRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null)

  if (controlId === 'state') {
    return <Text style={styles.stateNote}>Fault alerts are always active.</Text>
  }

  function formatAlertValue(value: number, bc: DerivedBatteryConfig | null, unit: string) {
    if (bc) {
      const pct = voltageToPercent(value, bc.minVoltage, bc.maxVoltage).toFixed(0)
      return `${pct}%`
    }
    return `${value}${unit ? ` ${unit}` : ''}`
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
        const isTts = rule.soundType.startsWith('tts:')
        const TypeIcon = isGeiger ? RadioactiveIcon : isTts ? ChatTextIcon : WaveformIcon

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
                color={rule.enabled ? theme.wheel.color : theme.neutral.textDim}
                weight="fill"
              />
            </View>

            <View style={styles.ruleContent}>
              <Text style={[styles.ruleThreshold, !rule.enabled && styles.ruleTextDisabled]}>
                {isGeiger
                  ? `${formatAlertValue(rule.threshold, batteryConfig, unit)} – ${formatAlertValue(rule.thresholdMax!, batteryConfig, unit)}`
                  : formatAlertValue(rule.threshold, batteryConfig, unit)}
              </Text>
              {isTts && (
                <Text
                  style={[styles.ruleTtsTemplate, !rule.enabled && styles.ruleTextDisabled]}
                  numberOfLines={1}
                >
                  {rule.soundType.slice(4)}
                </Text>
              )}
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
        batteryConfig={batteryConfig}
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

const styles = StyleSheet.create({
  stateNote: {
    color: theme.neutral.textDim,
    fontSize: 14,
  },
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
    backgroundColor: theme.neutral.surface,
  },
  ruleTypeIconActive: {
    backgroundColor: theme.wheel.bg,
  },
  ruleContent: {
    flex: 1,
  },
  ruleThreshold: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  ruleTtsTemplate: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  ruleTextDisabled: {
    color: theme.neutral.textDim,
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
})

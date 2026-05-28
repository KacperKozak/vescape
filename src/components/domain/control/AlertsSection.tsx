import { useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
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
import { type AlertRule, type AlertSoundType, useAlertsStore } from '@/store/alertsStore'

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
                color={rule.enabled ? theme.wheel.color : theme.neutral.textDim}
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

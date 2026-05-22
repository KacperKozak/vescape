import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CheckIcon, XIcon } from 'phosphor-react-native'

import { Dropdown } from '@/components/Dropdown'
import { TuneDial } from '@/components/tune/TuneDial'
import { snapValue } from '@/tune/sliderDefinitions'
import type { LinkedFieldPreview } from '@/tune/sliderDefinitions'
import { formatTuneValue } from '@/tune/fields'

export interface FieldEditorTarget {
  triggerRef: React.RefObject<View | null>
  label: string
  fieldId: string
  value: number
  min: number
  max: number
  step: number
  unit: string | null
  help: string
  linkedFields?: LinkedFieldPreview[]
}

interface FieldEditorPopoverProps {
  target: FieldEditorTarget | null
  onCancel: () => void
  onApply: (value: number) => void
}

export function FieldEditorPopover({ target, onCancel, onApply }: FieldEditorPopoverProps) {
  if (!target) return null

  return (
    <FieldEditorPopoverInner
      key={target.fieldId}
      target={target}
      onCancel={onCancel}
      onApply={onApply}
    />
  )
}

function FieldEditorPopoverInner({
  target,
  onCancel,
  onApply,
}: {
  target: FieldEditorTarget
  onCancel: () => void
  onApply: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState(target.value)
  const [draftText, setDraftText] = useState(formatTuneValue(target.value))

  const handleDialChange = useCallback((v: number) => {
    setDraftValue(v)
    setDraftText(formatTuneValue(v))
  }, [])

  return (
    <Dropdown
      visible
      triggerRef={target.triggerRef}
      onClose={onCancel}
      matchTriggerWidth={false}
      minWidth={300}
      maxHeight={380}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {target.label}
            </Text>
            <Text style={styles.fieldId}>{target.fieldId}</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onCancel}>
            <XIcon size={14} color="#cbd5e1" weight="bold" />
          </Pressable>
        </View>

        <Text style={styles.help} numberOfLines={2}>
          {target.help}
        </Text>

        <TextInput
          style={styles.input}
          value={draftText}
          keyboardType="numeric"
          selectTextOnFocus
          onChangeText={(text) => {
            const parsed = Number.parseFloat(text)
            setDraftText(text)
            if (Number.isFinite(parsed)) {
              setDraftValue(snapValue(parsed, target.min, target.max, target.step))
            }
          }}
        />

        <TuneDial
          value={draftValue}
          previousValue={target.value}
          min={target.min}
          max={target.max}
          step={target.step}
          onValueChange={handleDialChange}
        />

        {target.linkedFields && target.linkedFields.length > 0 ? (
          <View style={styles.linkedSection}>
            <Text style={styles.linkedTitle}>Linked fields</Text>
            {target.linkedFields.map((lf) => (
              <View key={lf.id} style={styles.linkedRow}>
                <Text style={styles.linkedLabel} numberOfLines={1}>
                  {lf.label}
                </Text>
                <Text style={styles.linkedValue}>
                  {formatTuneValue(lf.computeValue(draftValue))}
                  {lf.unit ? ` ${lf.unit}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={styles.applyBtn}
            onPress={() => onApply(snapValue(draftValue, target.min, target.max, target.step))}
          >
            <CheckIcon size={14} color="#020617" weight="bold" />
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Dropdown>
  )
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 380,
  },
  content: {
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  fieldId: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  help: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    height: 42,
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
  linkedSection: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    gap: 6,
  },
  linkedTitle: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  linkedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkedLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  linkedValue: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
  cancelBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  applyBtn: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  applyText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '900',
  },
})

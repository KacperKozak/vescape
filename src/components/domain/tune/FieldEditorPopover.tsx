import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { CaretDownIcon, CheckIcon, FadersIcon } from 'phosphor-react-native'

import { Button } from '@/components/ui/base/Button'
import { EdgeDrawer } from '@/components/ui/overlays/AnchoredSheet'
import { TuneDial } from '@/components/ui/tune/TuneDial'
import { theme } from '@/constants/theme'
import { snapValue } from '@/lib/tune/sliderDefinitions'
import type { LinkedFieldPreview } from '@/lib/tune/sliderDefinitions'
import { formatTuneValue } from '@/lib/tune/fields'

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

interface FieldEditorPopoverInnerProps {
  target: FieldEditorTarget
  onCancel: () => void
  onApply: (value: number) => void
}

function FieldEditorPopoverInner({ target, onCancel, onApply }: FieldEditorPopoverInnerProps) {
  const [draftValue, setDraftValue] = useState(target.value)
  const [detailsExpanded, setDetailsExpanded] = useState(false)

  return (
    <EdgeDrawer
      visible
      triggerRef={target.triggerRef}
      onClose={onCancel}
      edge="bottom"
      title={target.label}
      icon={FadersIcon}
      autoScrollOnContentExpand
    >
      <View style={styles.content}>
        <View style={styles.panel}>
          <TuneDial
            value={draftValue}
            previousValue={target.value}
            min={target.min}
            max={target.max}
            step={target.step}
            unit={target.unit}
            onValueChange={setDraftValue}
          />
          <View style={styles.dialBounds}>
            <Text style={styles.dialBoundText}>{formatTuneValue(target.min)}</Text>
            <Text style={styles.dialBoundText}>{formatTuneValue(target.max)}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Pressable
            style={styles.detailsHeader}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsExpanded }}
            onPress={() => setDetailsExpanded((expanded) => !expanded)}
          >
            <Text style={styles.panelTitle}>Setting details</Text>
            <CaretDownIcon
              size={16}
              color={theme.palette.slate.textMuted}
              weight="bold"
              style={{ transform: [{ rotate: detailsExpanded ? '180deg' : '0deg' }] }}
            />
          </Pressable>
          {detailsExpanded ? (
            <View style={styles.detailsContent}>
              <Text style={styles.help}>{target.help}</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Field</Text>
                <Text style={styles.fieldId}>{target.fieldId}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Range</Text>
                <Text style={styles.dataValue}>
                  {formatTuneValue(target.min)} to {formatTuneValue(target.max)}
                </Text>
              </View>
              {target.unit ? (
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Unit</Text>
                  <Text style={styles.dataValue}>{target.unit}</Text>
                </View>
              ) : null}
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
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            style={styles.actionButton}
            onPress={onCancel}
          />
          <Button
            label="Apply"
            icon={CheckIcon}
            style={styles.actionButton}
            onPress={() => onApply(snapValue(draftValue, target.min, target.max, target.step))}
          />
        </View>
      </View>
    </EdgeDrawer>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  panel: {
    padding: 14,
    gap: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surface,
  },
  panelTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dialBounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  dialBoundText: {
    color: theme.palette.slate.textDim,
    fontSize: 8,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 9,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsContent: {
    gap: 12,
  },
  fieldId: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  dataValue: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dataLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  help: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  linkedSection: {
    borderTopWidth: 1,
    borderTopColor: theme.palette.slate.border,
    paddingTop: 10,
    gap: 6,
  },
  linkedTitle: {
    color: theme.palette.slate.textDim,
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
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  linkedValue: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  actionButton: {
    minWidth: 128,
  },
})

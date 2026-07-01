import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import {
  FieldEditorPopover,
  type FieldEditorTarget,
} from '@/components/domain/tune/FieldEditorPopover'
import { useTriggerRef } from '@/components/ui/forms/Dropdown'
import { TuneDial } from '@/components/ui/tune/TuneDial'
import { widgetSurface, type WidgetSize } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'
import { formatTuneValue } from '@/lib/tune/fields'

interface DialWidgetProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string | null
  previousValue?: number
  /** Accent for the label. */
  accent?: string
  size?: WidgetSize
  /** Help text shown in the square tile's editor modal. */
  help?: string
  onValueChange: (value: number) => void
}

/**
 * A labelled {@link TuneDial} on a widget surface.
 *
 * The dial needs horizontal room to scrub, so at `square` (1×1) it collapses to a
 * value tile that opens a {@link FieldEditorPopover} on tap instead of an unusable
 * mini-dial.
 */
export function DialWidget(props: DialWidgetProps) {
  if (props.size === 'square') return <SquareDial {...props} />
  return <DialRow {...props} />
}

function DialRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  previousValue,
  accent = theme.palette.slate.textSecondary,
  onValueChange,
}: DialWidgetProps) {
  return (
    <View style={styles.widget}>
      <Text style={[styles.label, { color: accent }]} numberOfLines={1}>
        {label}
      </Text>
      <TuneDial
        value={value}
        previousValue={previousValue}
        min={min}
        max={max}
        step={step}
        unit={unit}
        onValueChange={onValueChange}
      />
    </View>
  )
}

function SquareDial({
  label,
  value,
  min,
  max,
  step,
  unit,
  accent = theme.palette.slate.textSecondary,
  help = '',
  onValueChange,
}: DialWidgetProps) {
  const triggerRef = useTriggerRef()
  const [open, setOpen] = useState(false)

  const target: FieldEditorTarget | null = open
    ? {
        triggerRef,
        label,
        fieldId: label,
        value,
        min,
        max,
        step,
        unit: unit ?? null,
        help,
      }
    : null

  return (
    <>
      <Pressable
        ref={triggerRef}
        style={({ pressed }) => [styles.widget, styles.square, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityLabel={`Edit ${label}`}
      >
        <Text style={[styles.label, { color: accent }]} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.readout}>
          <Text style={styles.readoutValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatTuneValue(value)}
          </Text>
          {unit ? <Text style={styles.readoutUnit}>{unit}</Text> : null}
        </View>
      </Pressable>
      <FieldEditorPopover
        target={target}
        onCancel={() => setOpen(false)}
        onApply={(next) => {
          onValueChange(next)
          setOpen(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
    padding: 12,
    gap: 8,
  },
  square: {
    aspectRatio: 1,
    justifyContent: 'space-between',
  },
  pressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  readoutValue: {
    color: theme.palette.slate.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  readoutUnit: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 5,
  },
})

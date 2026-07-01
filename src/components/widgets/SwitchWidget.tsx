import { StyleSheet, Switch, Text, View } from 'react-native'
import type { Icon } from 'phosphor-react-native'

import { widgetSurface, type WidgetSize } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface SwitchWidgetProps {
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
  icon?: Icon
  hint?: string
  /** Accent for the icon and the active track/thumb. */
  accent?: string
  size?: WidgetSize
  accessibilityLabel?: string
}

/** A labelled native switch on a widget surface — toggles a single boolean. */
export function SwitchWidget({
  label,
  value,
  onValueChange,
  icon: IconComponent,
  hint,
  accent = theme.palette.sky.color,
  size = 'full',
  accessibilityLabel,
}: SwitchWidgetProps) {
  const square = size === 'square'

  const control = (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: theme.palette.slate.border, true: theme.alpha(accent, 0.6) }}
      thumbColor={value ? accent : theme.palette.slate.textMuted}
      ios_backgroundColor={theme.palette.slate.border}
      accessibilityLabel={accessibilityLabel ?? label}
    />
  )

  if (square) {
    return (
      <View style={[styles.widget, styles.widgetSquare]}>
        {IconComponent ? <IconComponent size={26} color={accent} weight="duotone" /> : null}
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.squareControl}>{control}</View>
      </View>
    )
  }

  return (
    <View style={[styles.widget, styles.widgetRow]}>
      {IconComponent ? <IconComponent size={22} color={accent} weight="duotone" /> : null}
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint && size === 'full' ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {control}
    </View>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  widgetSquare: {
    aspectRatio: 1,
    justifyContent: 'space-between',
    gap: 8,
    padding: 14,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
  },
  squareControl: {
    alignItems: 'flex-start',
  },
})

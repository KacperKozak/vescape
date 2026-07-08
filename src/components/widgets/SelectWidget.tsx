import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { CaretDownIcon, type Icon } from 'phosphor-react-native'

import { widgetSurface } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface SelectWidgetProps {
  icon: Icon
  label: string
  value: string
  description?: string
  accent?: string
  disabled?: boolean
  showSelect?: boolean
  onPress: () => void
  onSelectPress?: () => void
}

/** A compact 1×4 select-like widget: title + description with a current value pill. */
export function SelectWidget({
  icon: IconComponent,
  label,
  value,
  description,
  accent = theme.palette.slate.textSecondary,
  disabled,
  showSelect = true,
  onPress,
  onSelectPress,
}: SelectWidgetProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.widget,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <IconComponent size={22} color={accent} weight="duotone" />
      <View style={styles.body}>
        <View style={styles.textColumn}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
        {showSelect ? (
          <Pressable
            style={styles.valuePill}
            disabled={disabled || !onSelectPress}
            onPress={(event) => {
              event.stopPropagation()
              onSelectPress?.()
            }}
            accessibilityRole="button"
            accessibilityLabel={`${label} options`}
          >
            <Text style={styles.value} numberOfLines={1}>
              {value}
            </Text>
            <CaretDownIcon size={13} color={theme.palette.slate.textMuted} weight="bold" />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  pressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  disabled: {
    opacity: 0.5,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  label: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  valuePill: {
    maxWidth: '48%',
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  value: {
    flexShrink: 1,
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
})

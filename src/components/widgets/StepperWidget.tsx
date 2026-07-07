import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { CaretDownIcon, CaretUpIcon, type Icon } from 'phosphor-react-native'

import { IconButton } from '@/components/ui/base/IconButton'
import { widgetSurface, type WidgetSize } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface StepperWidgetProps {
  icon?: Icon
  label: string
  previousIcon?: Icon
  nextIcon?: Icon
  accent?: string
  size?: Extract<WidgetSize, 'half' | 'full'>
  disabled?: boolean
  previousAccessibilityLabel?: string
  nextAccessibilityLabel?: string
  onPrevious: () => void
  onNext: () => void
}

/** A widget with two explicit actions at the trailing edge, useful for nudge controls. */
export function StepperWidget({
  icon: IconComponent,
  label,
  previousIcon = CaretDownIcon,
  nextIcon = CaretUpIcon,
  accent = theme.palette.slate.textSecondary,
  size = 'full',
  disabled,
  previousAccessibilityLabel = `${label} back`,
  nextAccessibilityLabel = `${label} forward`,
  onPrevious,
  onNext,
}: StepperWidgetProps) {
  return (
    <View style={[styles.widget, size === 'half' && styles.half]}>
      {IconComponent ? (
        <IconComponent
          size={22}
          color={disabled ? theme.palette.slate.textDim : accent}
          weight="duotone"
        />
      ) : null}
      <Text style={[styles.label, disabled && styles.labelDisabled]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.actions}>
        <IconButton
          icon={previousIcon}
          disabled={disabled}
          onPress={onPrevious}
          accessibilityLabel={previousAccessibilityLabel}
        />
        <IconButton
          icon={nextIcon}
          disabled={disabled}
          onPress={onNext}
          accessibilityLabel={nextAccessibilityLabel}
        />
      </View>
    </View>
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
  half: {
    minHeight: 64,
  },
  label: {
    flex: 1,
    minWidth: 0,
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  labelDisabled: {
    color: theme.palette.slate.textDim,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
})

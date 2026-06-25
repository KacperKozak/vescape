import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { interaction, theme } from '@/constants/theme'

interface HistoryNavigatorProps {
  label: string
  onPrevious: () => void
  onNext: () => void
  onSelect?: () => void
  previousDisabled?: boolean
  nextDisabled?: boolean
  accessibilityLabel?: string
}

export function HistoryNavigator({
  label,
  onPrevious,
  onNext,
  onSelect,
  previousDisabled = false,
  nextDisabled = false,
  accessibilityLabel = 'History session',
}: HistoryNavigatorProps) {
  return (
    <View style={styles.container}>
      <NavButton
        label="Previous"
        disabled={previousDisabled}
        onPress={onPrevious}
        icon={<CaretLeftIcon size={18} color={theme.palette.slate.textPrimary} weight="bold" />}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={!onSelect}
        onPress={onSelect}
        android_ripple={interaction.ripple}
        style={({ pressed }) => [styles.select, pressed && onSelect && styles.pressed]}
      >
        <Text style={styles.selectText} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <NavButton
        label="Next"
        disabled={nextDisabled}
        onPress={onNext}
        icon={<CaretRightIcon size={18} color={theme.palette.slate.textPrimary} weight="bold" />}
      />
    </View>
  )
}

function NavButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string
  icon: ReactNode
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={interaction.rippleBorderless}
      style={({ pressed }) => [
        styles.navButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    minWidth: 220,
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surfaceDeep,
    overflow: 'hidden',
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  select: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.palette.slate.border,
  },
  selectText: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: 0.35,
  },
})

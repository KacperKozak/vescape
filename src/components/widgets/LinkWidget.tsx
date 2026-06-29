import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CaretRightIcon, type Icon } from 'phosphor-react-native'

import { widgetSurface } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface LinkWidgetProps {
  icon: Icon
  label: string
  hint?: string
  accent?: string
  onPress: () => void
}

/** A tappable widget that links somewhere — icon, label, hint and a chevron. */
export function LinkWidget({
  icon: IconComponent,
  label,
  hint,
  accent = theme.palette.slate.textSecondary,
  onPress,
}: LinkWidgetProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.widget, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <IconComponent size={22} color={accent} weight="duotone" />
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <CaretRightIcon size={18} color={theme.palette.slate.textMuted} weight="bold" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  pressed: {
    backgroundColor: theme.palette.slate.surface,
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
})

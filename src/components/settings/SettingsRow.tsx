import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CaretRightIcon } from 'phosphor-react-native'
import type { Icon, IconWeight } from 'phosphor-react-native'

export type SettingsRowProps = {
  icon: Icon
  iconColor?: string
  iconWeight?: IconWeight
  label: string
  hint?: string
  onPress?: () => void
  right?: ReactNode
}

export function SettingsRow({
  icon: IconComponent,
  iconColor = '#94a3b8',
  iconWeight = 'duotone',
  label,
  hint,
  onPress,
  right,
}: SettingsRowProps) {
  const showChevron = onPress && !right

  const content = (
    <>
      <View style={styles.icon}>
        <IconComponent size={20} color={iconColor} weight={iconWeight} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {right}
      {showChevron ? <CaretRightIcon size={18} color="#64748b" weight="bold" /> : null}
    </>
  )

  if (onPress) {
    return (
      <Pressable style={styles.row} onPress={onPress}>
        {content}
      </Pressable>
    )
  }

  return <View style={styles.row}>{content}</View>
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
  },
})

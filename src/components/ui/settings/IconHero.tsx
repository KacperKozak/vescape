import { View, Text, StyleSheet } from 'react-native'
import type { Icon } from 'phosphor-react-native'
import type { ReactNode } from 'react'

import { theme } from '@/constants/theme'

type IconHeroProps = {
  icon: Icon
  title?: string
  description?: string
  children?: ReactNode
  iconSize?: number
  iconColor?: string
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}

export function IconHero({
  icon: IconComponent,
  title,
  description,
  children,
  iconSize = 64,
  iconColor = theme.neutral.textMuted,
  iconWeight = 'thin',
}: IconHeroProps) {
  return (
    <View style={styles.container}>
      <IconComponent size={iconSize} color={iconColor} weight={iconWeight} />
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },

  title: {
    color: theme.neutral.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: theme.neutral.textMuted,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
  },
})

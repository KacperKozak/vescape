import { View, Text, StyleSheet } from 'react-native'
import type { Icon } from 'phosphor-react-native'
import type { ReactNode } from 'react'

import { theme } from '@/constants/theme'

type IconHeroProps = {
  icon: Icon
  description: string
  children?: ReactNode
}

export function IconHero({ icon: IconComponent, description, children }: IconHeroProps) {
  return (
    <View style={styles.container}>
      <IconComponent size={64} color={theme.neutral.textMuted} weight="thin" />
      <Text style={styles.description}>{description}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 32,
    gap: 12,
  },
  description: {
    color: theme.neutral.textMuted,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
  },
})

import { StyleSheet, Text } from 'react-native'

export type SettingsSectionTitleProps = {
  children: string
}

export function SettingsSectionTitle({ children }: SettingsSectionTitleProps) {
  return <Text style={styles.title}>{children}</Text>
}

const styles = StyleSheet.create({
  title: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
})

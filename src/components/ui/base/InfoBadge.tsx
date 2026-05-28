import { Pressable, Text, StyleSheet } from 'react-native'
import { InfoIcon } from 'phosphor-react-native'
import { theme } from '@/constants/theme'

interface InfoBadgeProps {
  label: string
  danger?: boolean
  onPress: () => void
}

export function InfoBadge({ label, danger = false, onPress }: InfoBadgeProps) {
  return (
    <Pressable style={[styles.metaBadge, danger && styles.metaBadgeDanger]} onPress={onPress}>
      <Text style={[styles.metaText, danger && styles.metaTextDanger]} selectable>
        {label}
      </Text>
      <InfoIcon
        size={12}
        color={danger ? theme.error.text : theme.neutral.textMuted}
        weight="bold"
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  metaBadge: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.neutral.surface,
    borderWidth: 1,
    borderColor: theme.neutral.border,
  },
  metaBadgeDanger: {
    backgroundColor: theme.error.bg,
    borderColor: theme.error.border,
  },
  metaText: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  metaTextDanger: {
    color: theme.error.text,
  },
})

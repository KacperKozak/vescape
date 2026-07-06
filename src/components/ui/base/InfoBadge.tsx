import { Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/base/Text'
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
        color={danger ? theme.status.error.text : theme.palette.slate.textMuted}
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
    backgroundColor: theme.palette.slate.surface,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
  },
  metaBadgeDanger: {
    backgroundColor: theme.status.error.bg,
    borderColor: theme.status.error.border,
  },
  metaText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  metaTextDanger: {
    color: theme.status.error.text,
  },
})

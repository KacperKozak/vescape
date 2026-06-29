import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CheckIcon, PencilSimpleIcon } from 'phosphor-react-native'

import { Input } from '@/components/ui/forms/Input'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface InputWidgetProps {
  label: string
  value: string | null
  placeholder?: string
  maxLength?: number
  onCommit: (value: string) => void
  accessibilityLabel?: string
}

/** A labelled value that flips to an inline text field when the pencil is tapped. */
export function InputWidget({
  label,
  value,
  placeholder,
  maxLength,
  onCommit,
  accessibilityLabel,
}: InputWidgetProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = () => {
    if (draft.trim() !== (value ?? '')) onCommit(draft)
    setEditing(false)
  }

  return (
    <View style={styles.widget}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {editing ? (
          <Input
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            placeholder={placeholder}
            placeholderTextColor={theme.palette.slate.textMuted}
            returnKeyType="done"
            maxLength={maxLength}
            autoFocus
            style={styles.input}
            accessibilityLabel={accessibilityLabel ?? label}
          />
        ) : (
          <Text style={styles.value} numberOfLines={1}>
            {value?.trim() || placeholder}
          </Text>
        )}
      </View>
      <Pressable
        onPress={editing ? commit : startEdit}
        hitSlop={10}
        style={styles.editBtn}
        accessibilityLabel={editing ? 'Save' : 'Edit'}
      >
        {editing ? (
          <CheckIcon size={18} color={theme.palette.green.color} weight="bold" />
        ) : (
          <PencilSimpleIcon size={18} color={theme.palette.slate.textSecondary} weight="bold" />
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  label: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    color: theme.palette.slate.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    paddingVertical: 6,
  },
  editBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

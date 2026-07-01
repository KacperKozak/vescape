import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CheckIcon, PencilSimpleIcon } from 'phosphor-react-native'

import { Input } from '@/components/ui/forms/Input'
import { TextPromptModal } from '@/components/ui/modals/TextPromptModal'
import { widgetSurface, type WidgetSize } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'

interface InputWidgetProps {
  label: string
  value: string | null
  placeholder?: string
  maxLength?: number
  size?: WidgetSize
  onCommit: (value: string) => void
  accessibilityLabel?: string
  /** Optional control rendered at the widget's trailing edge, before the edit button. */
  accessory?: ReactNode
}

/** A labelled value that flips to an inline text field when the pencil is tapped. */
export function InputWidget(props: InputWidgetProps) {
  if (props.size === 'square') return <SquareInput {...props} />
  return <RowInput {...props} />
}

function RowInput({
  label,
  value,
  placeholder,
  maxLength,
  onCommit,
  accessibilityLabel,
  accessory,
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
    <View style={[styles.widget, styles.widgetRow]}>
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
      {accessory}
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

function SquareInput({
  label,
  value,
  placeholder,
  maxLength,
  onCommit,
  accessibilityLabel,
  accessory,
}: InputWidgetProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.widget, styles.widgetSquare, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityLabel={accessibilityLabel ?? `Edit ${label}`}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.squareFooter}>
          <Text style={styles.value} numberOfLines={2}>
            {value?.trim() || placeholder}
          </Text>
          {accessory}
        </View>
      </Pressable>
      <TextPromptModal
        visible={open}
        title={label}
        placeholder={placeholder}
        initialValue={value ?? ''}
        confirmLabel="Save"
        onConfirm={(next) => {
          onCommit(maxLength ? next.slice(0, maxLength) : next)
          setOpen(false)
        }}
        onDismiss={() => setOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  widgetSquare: {
    aspectRatio: 1,
    justifyContent: 'space-between',
    gap: 8,
    padding: 14,
  },
  pressed: {
    backgroundColor: theme.palette.slate.surface,
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
    flex: 1,
    minWidth: 0,
  },
  input: {
    paddingVertical: 6,
  },
  squareFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  editBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

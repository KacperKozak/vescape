import { useState } from 'react'
import { Modal, Pressable, TextInput, Text, View, StyleSheet } from 'react-native'
import { CheckIcon } from 'phosphor-react-native'
import { theme } from '@/constants/theme'

interface TextPromptModalContentProps {
  title: string
  placeholder?: string
  initialValue: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onDismiss: () => void
}

function TextPromptModalContent({
  title,
  placeholder,
  initialValue,
  confirmLabel,
  onConfirm,
  onDismiss,
}: TextPromptModalContentProps) {
  const [text, setText] = useState(initialValue)
  return (
    <Pressable style={styles.modalBackdrop} onPress={onDismiss}>
      <Pressable style={styles.promptModal} onPress={(e) => e.stopPropagation()}>
        <Text style={styles.promptTitle}>{title}</Text>
        <TextInput
          style={styles.promptInput}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#475569"
          autoFocus
          selectTextOnFocus
        />
        <View style={styles.promptActions}>
          <Pressable style={styles.promptCancelBtn} onPress={onDismiss}>
            <Text style={styles.promptCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={styles.promptConfirmBtn}
            onPress={() => text.trim() && onConfirm(text.trim())}
          >
            <CheckIcon size={15} color="#020617" weight="bold" />
            <Text style={styles.promptConfirmText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  )
}

interface TextPromptModalProps {
  visible: boolean
  title: string
  placeholder?: string
  initialValue: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onDismiss: () => void
}

export function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel,
  onConfirm,
  onDismiss,
}: TextPromptModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {visible ? (
        <TextPromptModalContent
          title={title}
          placeholder={placeholder}
          initialValue={initialValue}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      ) : null}
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    padding: 32,
  },
  promptModal: {
    width: '100%',
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    padding: 16,
    gap: 14,
  },
  promptTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  promptInput: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    color: '#f8fafc',
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  promptCancelBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptCancelText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
  },
  promptConfirmBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.wheel.color,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  promptConfirmText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '900',
  },
})

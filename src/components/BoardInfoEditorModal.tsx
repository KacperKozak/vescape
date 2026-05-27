import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { BoardInfoForm } from '@/components/BoardInfoForm'
import { Button } from '@/components/Button'

interface BoardInfoEditorModalProps {
  visible: boolean
  name: string
  description: string
  saving?: boolean
  onSave: (value: { name: string; description: string }) => Promise<void> | void
  onCancel: () => void
}

export function BoardInfoEditorModal({
  visible,
  name,
  description,
  saving = false,
  onSave,
  onCancel,
}: BoardInfoEditorModalProps) {
  const handleCancel = () => {
    if (!saving) onCancel()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleCancel} disabled={saving} />
        {visible ? (
          <BoardInfoEditorModalContent
            name={name}
            description={description}
            saving={saving}
            onSave={onSave}
          />
        ) : null}
      </View>
    </Modal>
  )
}

function BoardInfoEditorModalContent({
  name,
  description,
  saving,
  onSave,
}: {
  name: string
  description: string
  saving: boolean
  onSave: (value: { name: string; description: string }) => Promise<void> | void
}) {
  const [draftName, setDraftName] = useState(name)
  const [draftDescription, setDraftDescription] = useState(description)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Board info</Text>
      <BoardInfoForm
        name={draftName}
        description={draftDescription}
        onChangeName={setDraftName}
        onChangeDescription={setDraftDescription}
      />
      <Button
        label="Save"
        loading={saving}
        onPress={() => onSave({ name: draftName, description: draftDescription })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#131c2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '800',
  },
})

import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { routes } from '@/navigation/routes'

export default function BoardDetailsScreen() {
  const { bleId, bleName, boardId } = useLocalSearchParams<{
    bleId?: string
    bleName?: string
    boardId?: string
  }>()
  const { boards, addBoard, updateBoard, removeBoard } = useBoardStore(
    useShallow((s) => ({
      boards: s.boards,
      addBoard: s.addBoard,
      updateBoard: s.updateBoard,
      removeBoard: s.removeBoard,
    })),
  )
  const navigation = useNavigation()

  const editingBoard = boardId ? boards.find((b) => b.id === boardId) : undefined

  const [name, setName] = useState(editingBoard?.name ?? bleName ?? '')
  const [description, setDescription] = useState(editingBoard?.description ?? '')
  const [pairedBleId, setPairedBleId] = useState(editingBoard?.bleId ?? bleId ?? '')
  const [pairedBleName, setPairedBleName] = useState(bleName ?? '')
  const [minVoltage, setMinVoltage] = useState(
    editingBoard?.minVoltage != null ? String(editingBoard.minVoltage) : '',
  )
  const [maxVoltage, setMaxVoltage] = useState(
    editingBoard?.maxVoltage != null ? String(editingBoard.maxVoltage) : '',
  )

  useEffect(() => {
    navigation.setOptions({ title: editingBoard ? 'Edit Board' : 'Board Details' })
  }, [editingBoard, navigation])

  useEffect(() => {
    if (bleId) setPairedBleId(bleId)
    if (bleName) setPairedBleName(bleName)
  }, [bleId, bleName])

  const parseVoltage = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const handleSave = () => {
    if (!name.trim()) return
    const minV = parseVoltage(minVoltage)
    const maxV = parseVoltage(maxVoltage)
    if (editingBoard) {
      void updateBoard({
        ...editingBoard,
        name: name.trim(),
        description: description.trim() || null,
        bleId: pairedBleId.trim() || null,
        minVoltage: minV,
        maxVoltage: maxV,
      })
    } else {
      addBoard({
        name: name.trim(),
        description: description.trim() || undefined,
        bleId: pairedBleId.trim() || undefined,
        minVoltage: minV,
        maxVoltage: maxV,
      })
    }
    router.dismissAll()
  }

  const handleOpenPairing = () => {
    router.push({
      pathname: routes.addBoardScan,
      params: editingBoard ? { boardId: editingBoard.id } : undefined,
    })
  }

  const handleUnpair = () => {
    setPairedBleId('')
    setPairedBleName('')
  }

  const handleRemoveBoard = () => {
    if (!editingBoard) return
    Alert.alert('Remove Board', `Remove "${editingBoard.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void removeBoard(editingBoard.id)
          router.dismissAll()
        },
      },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {pairedBleId ? (
            <View style={styles.pairedBadge}>
              <View style={styles.pairedDot} />
              <Text style={styles.pairedText}>Paired with {pairedBleName || pairedBleId}</Text>
            </View>
          ) : (
            <View style={styles.unpairedBadge}>
              <Text style={styles.unpairedText}>
                No device paired — you can pair later in board settings
              </Text>
            </View>
          )}
          <View style={styles.pairActions}>
            <Pressable style={styles.pairButton} onPress={handleOpenPairing}>
              <Text style={styles.pairButtonText}>
                {pairedBleId ? 'Change BLE Pairing' : 'Pair BLE Device'}
              </Text>
            </Pressable>
            {pairedBleId ? (
              <Pressable style={styles.secondaryButton} onPress={handleUnpair}>
                <Text style={styles.secondaryButtonText}>Remove pairing</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.label}>Board name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. FloBoard Pro"
            placeholderTextColor="#4b5563"
            autoFocus
            returnKeyType="next"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description ?? ''}
            onChangeText={setDescription}
            placeholder="Optional notes about this board"
            placeholderTextColor="#4b5563"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Battery — pack voltage range (V)</Text>
          <Text style={styles.helper}>
            Set empty + full pack voltage to show battery % (e.g. 10S Li-ion: 30 / 42).
          </Text>
          <View style={styles.voltageRow}>
            <TextInput
              style={[styles.input, styles.voltageInput]}
              value={minVoltage}
              onChangeText={setMinVoltage}
              placeholder="Min (0%)"
              placeholderTextColor="#4b5563"
              keyboardType="decimal-pad"
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, styles.voltageInput]}
              value={maxVoltage}
              onChangeText={setMaxVoltage}
              placeholder="Max (100%)"
              placeholderTextColor="#4b5563"
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </View>

          <Pressable
            style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!name.trim()}
          >
            <Text style={styles.saveButtonText}>Save Board</Text>
          </Pressable>

          {editingBoard ? (
            <Pressable style={styles.removeButton} onPress={handleRemoveBoard}>
              <Text style={styles.removeButtonText}>Remove Board</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#111827',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  pairedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#052e16',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  pairedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  pairedText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  unpairedBadge: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  unpairedText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  pairActions: {
    gap: 8,
    marginBottom: 8,
  },
  pairButton: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  pairButtonText: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#f9fafb',
    fontSize: 16,
    marginBottom: 4,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  helper: {
    color: '#6b7280',
    fontSize: 11,
    marginBottom: 6,
  },
  voltageRow: {
    flexDirection: 'row',
    gap: 8,
  },
  voltageInput: {
    flex: 1,
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#1f2937',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  removeButton: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#1f2937',
  },
  removeButtonText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '700',
  },
})

import { StyleSheet, Text, TextInput, View } from 'react-native'

interface BoardInfoFormProps {
  name: string
  description: string
  onChangeName: (value: string) => void
  onChangeDescription: (value: string) => void
}

export function BoardInfoForm({
  name,
  description,
  onChangeName,
  onChangeDescription,
}: BoardInfoFormProps) {
  return (
    <View style={styles.form}>
      <Text style={styles.label}>Board name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onChangeName}
        placeholder="e.g. FloBoard Pro"
        placeholderTextColor="#4b5563"
        returnKeyType="next"
      />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={description}
        onChangeText={onChangeDescription}
        placeholder="Optional notes about this board"
        placeholderTextColor="#4b5563"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  label: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#f9fafb',
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 84,
    paddingTop: 12,
  },
})

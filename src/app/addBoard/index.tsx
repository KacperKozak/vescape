import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AddBoardWizard } from '@/components/domain/board/AddBoardWizard'
import { theme } from '@/constants/theme'
import { useAddBoardWizard } from '@/hooks/useAddBoardWizard'

export default function AddBoardScreen() {
  const wizard = useAddBoardWizard()

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AddBoardWizard wizard={wizard} />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 10,
  },
})

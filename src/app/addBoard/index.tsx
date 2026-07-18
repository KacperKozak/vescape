import { useCallback, useRef } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AddBoardWizard } from '@/modules/board/components/AddBoardWizard'
import { theme } from '@/constants/theme'
import { useAddBoardWizard } from '@/modules/board/hooks/useAddBoardWizard'

const LINK_STEP_ROW_HEIGHT = 76

export default function AddBoardScreen() {
  const wizard = useAddBoardWizard()
  const scrollRef = useRef<ScrollView>(null)

  const handleLinkActiveStepIndexChange = useCallback((index: number) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: index < 0 ? 0 : Math.max(0, index * LINK_STEP_ROW_HEIGHT - LINK_STEP_ROW_HEIGHT),
        animated: true,
      })
    })
  }, [])

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <AddBoardWizard
            wizard={wizard}
            onLinkActiveStepIndexChange={handleLinkActiveStepIndexChange}
          />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 10,
  },
})

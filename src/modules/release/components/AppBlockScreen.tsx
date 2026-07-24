import { Modal, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WarningOctagonIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { Markdown } from '@/components/base/Markdown'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'

interface AppBlockScreenProps {
  visible: boolean
  /** Markdown body — the server message or a bundled default. */
  message: string
  /** Open the stable platform download route. The only action App Block offers. */
  onUpdate: () => void
}

/**
 * The exceptional App Block presentation: a full-screen, non-dismissible update-only shell that
 * covers normal navigation. Its single action opens the stable platform download route; there is no
 * close, backdrop-dismiss, or hardware-back exit. Presentational only — {@link AppBlockGate} decides
 * when it appears.
 *
 * This shell issues no Board Session or Ride Recording command: already-running native work keeps
 * going underneath it (PRD story 9).
 */
export function AppBlockScreen({ visible, message, onUpdate }: AppBlockScreenProps) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      // App Block is not dismissible: swallow the Android hardware back press instead of exiting.
      onRequestClose={() => {}}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <WarningOctagonIcon size={28} color={theme.status.error.color} weight="fill" />
          </View>
          <Text style={styles.title}>Update required</Text>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Markdown>{message}</Markdown>
        </ScrollView>
        <Button label="Update Vescape" onPress={onUpdate} style={styles.action} />
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
    padding: 24,
    gap: 20,
  },
  header: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 24,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.status.error.bg,
    borderWidth: 1,
    borderColor: theme.status.error.border,
  },
  title: {
    color: theme.palette.slate.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 12,
  },
  action: {
    backgroundColor: theme.status.upgrade.color,
  },
})

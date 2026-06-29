import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'

import { SquaresFourIcon } from 'phosphor-react-native'
import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { CornerSheet } from '@/components/ui/overlays/CornerSheet'
import { useTriggerRef } from '@/components/ui/overlays/measureTrigger'
import { IconHero } from '@/components/ui/settings/IconHero'
import { InfoModal } from '@/components/ui/modals/InfoModal'
import { TextPromptModal } from '@/components/ui/modals/TextPromptModal'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { OpenButton, ToggleRow } from '@/components/ui/dev/ShowcaseControls'
import { theme } from '@/constants/theme'

function ConfirmModalShowcase() {
  const [visible, setVisible] = useState(false)
  const [destructive, setDestructive] = useState(false)

  return (
    <ShowcaseCard
      name="ConfirmModal"
      controls={
        <>
          <ToggleRow label="destructive" value={destructive} onToggle={setDestructive} />
          <OpenButton onPress={() => setVisible(true)} />
        </>
      }
    >
      <Text style={styles.previewHint}>Tap &quot;Open Modal&quot; below</Text>
      <ConfirmModal
        visible={visible}
        title={destructive ? 'Delete profile?' : 'Apply changes?'}
        message={
          destructive ? 'This action cannot be undone.' : 'New settings will be synced to board.'
        }
        confirmLabel={destructive ? 'Delete' : 'Apply'}
        destructive={destructive}
        onConfirm={() => setVisible(false)}
        onCancel={() => setVisible(false)}
      />
    </ShowcaseCard>
  )
}

function InfoModalShowcase() {
  const [visible, setVisible] = useState(false)

  return (
    <ShowcaseCard name="InfoModal" controls={<OpenButton onPress={() => setVisible(true)} />}>
      <Text style={styles.previewHint}>Tap &quot;Open Modal&quot; below</Text>
      <InfoModal
        visible={visible}
        title="Motor Temperature"
        message="Measures heat at the motor stator. High temperatures reduce magnet strength and can damage winding insulation. Keep below 150°C for longevity."
        onDismiss={() => setVisible(false)}
      />
    </ShowcaseCard>
  )
}

function TextPromptModalShowcase() {
  const [visible, setVisible] = useState(false)

  return (
    <ShowcaseCard name="TextPromptModal" controls={<OpenButton onPress={() => setVisible(true)} />}>
      <Text style={styles.previewHint}>Tap &quot;Open Modal&quot; below</Text>
      <TextPromptModal
        visible={visible}
        title="Rename board"
        placeholder="Enter new name"
        initialValue="My Board"
        confirmLabel="Rename"
        onConfirm={(value) => {
          setVisible(false)
          console.log(value)
        }}
        onDismiss={() => setVisible(false)}
      />
    </ShowcaseCard>
  )
}

function CornerSheetShowcase() {
  const triggerRef = useTriggerRef()
  const [visible, setVisible] = useState(false)

  return (
    <ShowcaseCard
      name="CornerSheet"
      controls={
        <View ref={triggerRef} collapsable={false} style={styles.trigger}>
          <OpenButton onPress={() => setVisible(true)} />
        </View>
      }
    >
      <Text style={styles.previewHint}>Near-full-width sheet that drops from a corner trigger</Text>
      <CornerSheet
        visible={visible}
        triggerRef={triggerRef}
        anchor="left"
        title="Sheet title"
        onClose={() => setVisible(false)}
      >
        <View style={styles.tile}>
          <Text style={styles.tileText}>Tile one — a widget could live here.</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileText}>Tile two — another interactive block.</Text>
        </View>
      </CornerSheet>
    </ShowcaseCard>
  )
}

export default function ModalsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={SquaresFourIcon}
          description="ConfirmModal, InfoModal, TextPromptModal, CornerSheet."
        />
        <ConfirmModalShowcase />
        <InfoModalShowcase />
        <TextPromptModalShowcase />
        <CornerSheetShowcase />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  previewHint: { color: theme.palette.slate.textDim, fontSize: 12, fontStyle: 'italic' },
  trigger: { alignSelf: 'flex-start' },
  tile: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderColor: theme.palette.slate.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  tileText: { color: theme.palette.slate.textSecondary, fontSize: 14 },
})

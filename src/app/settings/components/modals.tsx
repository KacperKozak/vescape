import { ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'

import { SquaresFourIcon, UsersThreeIcon } from 'phosphor-react-native'
import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { EdgeDrawer, FloatingSheet } from '@/components/ui/overlays/AnchoredSheet'
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

interface EdgeDrawerPositionShowcaseProps {
  edge: 'auto' | 'top' | 'bottom'
  name: string
  description: string
}

function EdgeDrawerPositionShowcase({ edge, name, description }: EdgeDrawerPositionShowcaseProps) {
  const triggerRef = useTriggerRef()
  const [visible, setVisible] = useState(false)
  const dragInstruction =
    edge === 'top'
      ? 'Scroll to the end, then continue upward to move the whole drawer out.'
      : edge === 'bottom'
        ? 'At the top of the list, drag downward to move the whole drawer out.'
        : 'Scroll to the dismiss-side edge, then continue dragging to move the whole drawer out.'

  return (
    <ShowcaseCard
      name={name}
      controls={
        <View ref={triggerRef} collapsable={false} style={styles.trigger}>
          <OpenButton label={`Open ${edge}`} onPress={() => setVisible(true)} />
        </View>
      }
    >
      <Text style={styles.previewHint}>{description}</Text>
      <EdgeDrawer
        visible={visible}
        triggerRef={triggerRef}
        edge={edge}
        title={`${edge[0].toUpperCase()}${edge.slice(1)} drawer`}
        icon={UsersThreeIcon}
        onClose={() => setVisible(false)}
      >
        <View style={styles.tile}>
          <Text style={styles.tileText}>{dragInstruction}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileText}>Release early to test spring-back.</Text>
        </View>
      </EdgeDrawer>
    </ShowcaseCard>
  )
}

const LONG_CONTENT_SECTIONS = [
  {
    title: 'How the gesture works',
    body: 'This drawer contains ordinary text instead of a stack of controls. Swipe upward to read it exactly like a regular scroll view. The content should remain under your finger and preserve normal momentum.',
  },
  {
    title: 'Scrolling through content',
    body: 'While there is more text below, vertical gestures belong to the content. The surrounding drawer remains fixed in place. Slow drags, quick flicks, and stopping midway should all behave like normal list scrolling.',
  },
  {
    title: 'Reaching the boundary',
    body: 'At the end of the article there is nowhere left for the content to scroll. Continue dragging upward from that boundary and the gesture transfers to the complete drawer instead.',
  },
  {
    title: 'Moving the window',
    body: 'After the transfer, the title, text, grabber, and backdrop move together. The drawer tracks the finger directly rather than waiting for a swipe threshold before showing any movement.',
  },
  {
    title: 'Fling behavior',
    body: 'Release with enough upward velocity and the drawer continues off-screen. Release early with little velocity and it returns to its open position. This is the same interaction model used by system notification panels.',
  },
  {
    title: 'End of example',
    body: 'You are now at the dismiss boundary. Keep dragging upward to push the entire window out of view and close it.',
  },
] as const

function EdgeDrawerLongContentShowcase() {
  const triggerRef = useTriggerRef()
  const [visible, setVisible] = useState(false)

  return (
    <ShowcaseCard
      name="EdgeDrawer — long scrolling content"
      controls={
        <View ref={triggerRef} collapsable={false} style={styles.trigger}>
          <OpenButton label="Open long content" onPress={() => setVisible(true)} />
        </View>
      }
    >
      <Text style={styles.previewHint}>
        Regular text scrolls first; an upward drag at the end moves the complete drawer out.
      </Text>
      <EdgeDrawer
        visible={visible}
        triggerRef={triggerRef}
        edge="top"
        title="Gesture guide"
        onClose={() => setVisible(false)}
      >
        <View style={styles.article}>
          <Text style={styles.articleLead}>
            Scroll this full article, then continue the same upward motion at the end.
          </Text>
          {LONG_CONTENT_SECTIONS.map((section) => (
            <View key={section.title} style={styles.articleSection}>
              <Text style={styles.articleTitle}>{section.title}</Text>
              <Text style={styles.articleBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </EdgeDrawer>
    </ShowcaseCard>
  )
}

function FloatingSheetShowcase() {
  const triggerRef = useTriggerRef()
  const [visible, setVisible] = useState(false)

  return (
    <ShowcaseCard
      name="FloatingSheet"
      controls={
        <View ref={triggerRef} collapsable={false} style={styles.trigger}>
          <OpenButton onPress={() => setVisible(true)} />
        </View>
      }
    >
      <Text style={styles.previewHint}>Compact popover centered under its trigger</Text>
      <FloatingSheet
        visible={visible}
        triggerRef={triggerRef}
        matchTriggerWidth={false}
        minWidth={220}
        onClose={() => setVisible(false)}
      >
        <View style={styles.tile}>
          <Text style={styles.tileText}>Option one</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileText}>Option two</Text>
        </View>
      </FloatingSheet>
    </ShowcaseCard>
  )
}

export default function ModalsPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={SquaresFourIcon}
          description="ConfirmModal, InfoModal, TextPromptModal, EdgeDrawer, FloatingSheet."
        />
        <ConfirmModalShowcase />
        <InfoModalShowcase />
        <TextPromptModalShowcase />
        <EdgeDrawerPositionShowcase
          edge="auto"
          name="EdgeDrawer — automatic edge"
          description="Chooses top or bottom from the trigger's current screen position."
        />
        <EdgeDrawerPositionShowcase
          edge="top"
          name="EdgeDrawer — top edge"
          description="Always opens from the top. The complete drawer follows an upward drag."
        />
        <EdgeDrawerPositionShowcase
          edge="bottom"
          name="EdgeDrawer — bottom edge"
          description="Always opens from the bottom. The complete drawer follows a downward drag."
        />
        <EdgeDrawerLongContentShowcase />
        <FloatingSheetShowcase />
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
  article: { gap: 28, paddingHorizontal: 10, paddingBottom: 24 },
  articleLead: {
    color: theme.palette.slate.textPrimary,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
  },
  articleSection: { gap: 8 },
  articleTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  articleBody: {
    color: theme.palette.slate.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
})

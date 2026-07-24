import { useEffect, useMemo, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { InfoIcon, WarningIcon, WarningOctagonIcon, XIcon, type Icon } from 'phosphor-react-native'

import type { CommunityMessage, CommunityMessageAction, CommunityMessageType } from 'vescape-core'
import { Button } from '@/components/base/Button'
import { Markdown } from '@/components/base/Markdown'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'

const FADE_DURATION = 120

/** Icon, accent color and header label per message type — the importance cue (PRD story 27). */
const TYPE_STYLE: Record<CommunityMessageType, { icon: Icon; color: string; label: string }> = {
  info: { icon: InfoIcon, color: theme.status.info.color, label: 'Announcement' },
  warning: { icon: WarningIcon, color: theme.status.warning.color, label: 'Heads up' },
  critical: { icon: WarningOctagonIcon, color: theme.status.error.color, label: 'Important' },
}

interface CommunityMessageModalProps {
  /** The message to present, or `null` to dismiss the surface. */
  message: CommunityMessage | null
  onDismiss: () => void
  onAction: (action: CommunityMessageAction) => void
}

/**
 * One Community Message surface: renders the server Markdown body with a type-colored header and an
 * optional primary/secondary action. Purely presentational — {@link CommunityMessageGate} owns the
 * queue and decides which message (if any) appears here. A Community Message never changes capability
 * availability; this only communicates.
 */
export function CommunityMessageModal({
  message,
  onDismiss,
  onAction,
}: CommunityMessageModalProps) {
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.92), [])
  const [mounted, setMounted] = useState(false)
  const visible = message !== null
  const [prevVisible, setPrevVisible] = useState(false)
  // Hold the last shown message so the exit animation renders content instead of blanking.
  const [rendered, setRendered] = useState<CommunityMessage | null>(message)

  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setMounted(true)
  }
  if (message !== null && message !== rendered) setRendered(message)

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
      ]).start()
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: FADE_DURATION, useNativeDriver: true }),
        // Ignore a cancelled fade-out: if a next message arrives mid-exit, its reopen stops this
        // animation with `finished: false` — unmounting then would hide the reopened modal.
      ]).start(({ finished }) => {
        if (finished) setMounted(false)
      })
    }
  }, [visible, mounted, opacity, scale])

  if (!mounted || rendered === null) return null

  const { icon: TypeIcon, color, label } = TYPE_STYLE[rendered.type]
  const action = rendered.action

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <TypeIcon size={16} color={color} weight="bold" />
              <Text style={[styles.title, { color }]}>{label}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onDismiss}>
              <XIcon size={15} color={theme.palette.slate.textSecondary} weight="bold" />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Markdown>{rendered.body}</Markdown>
          </ScrollView>
          {action ? (
            <Button
              label={action.label}
              variant={action.type === 'primary' ? 'primary' : 'secondary'}
              onPress={() => onAction(action)}
            />
          ) : (
            <Button label="Dismiss" variant="secondary" onPress={onDismiss} />
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.alpha(theme.palette.mono.black, 0.6),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '78%',
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surface,
  },
  body: {
    maxHeight: 320,
  },
  bodyContent: {
    paddingRight: 2,
  },
})

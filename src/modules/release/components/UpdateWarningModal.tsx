import { useEffect, useMemo, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ArrowClockwiseIcon, XIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { Markdown } from '@/components/base/Markdown'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { DEFAULT_UPDATE_WARNING_MESSAGE } from '@/modules/release/constants/updateWarning'

const FADE_DURATION = 120

interface UpdateWarningModalProps {
  visible: boolean
  /** Markdown body — the server message or a bundled default. */
  message: string
  onDismiss: () => void
}

/**
 * Non-blocking Update Warning surface: renders the server (or bundled) Markdown message and a single
 * dismiss action. An Update Warning changes no capability availability — this only recommends.
 * Presentational only; {@link UpdateWarningGate} decides when it appears and drives dismissal.
 */
export function UpdateWarningModal({ visible, message, onDismiss }: UpdateWarningModalProps) {
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.92), [])
  const [mounted, setMounted] = useState(false)
  const [prevVisible, setPrevVisible] = useState(false)
  // Keep the last non-empty message so the exit animation renders content instead of blanking.
  const [renderedMessage, setRenderedMessage] = useState(DEFAULT_UPDATE_WARNING_MESSAGE)

  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setMounted(true)
  }
  if (visible && message !== renderedMessage) setRenderedMessage(message)

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
        // Ignore a cancelled fade-out: if `visible` flips back true mid-exit, the reopen animation
        // stops this one with `finished: false` — unmounting then would hide the reopened modal.
      ]).start(({ finished }) => {
        if (finished) setMounted(false)
      })
    }
  }, [visible, mounted, opacity, scale])

  if (!mounted) return null

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <ArrowClockwiseIcon size={16} color={theme.palette.purple.color} weight="bold" />
              <Text style={styles.title}>Update available</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onDismiss}>
              <XIcon size={15} color={theme.palette.slate.textSecondary} weight="bold" />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Markdown>{renderedMessage}</Markdown>
          </ScrollView>
          <Button label="Later" variant="secondary" onPress={onDismiss} />
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
    color: theme.palette.slate.textPrimary,
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

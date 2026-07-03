import { useEffect, useMemo, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { InfoIcon, WarningCircleIcon, XIcon } from 'phosphor-react-native'
import { theme } from '@/constants/theme'

const FADE_DURATION = 120

interface InfoModalProps {
  visible: boolean
  title: string
  message: string
  variant?: 'info' | 'warning'
  dismissLabel?: string
  onDismiss: () => void
}

const INFO_ACCENT = {
  Icon: InfoIcon,
  color: theme.palette.sky.color,
  buttonBg: theme.palette.sky.border,
}

const WARNING_ACCENT = {
  Icon: WarningCircleIcon,
  color: theme.palette.amber.text,
  buttonBg: theme.palette.amber.border,
}

export function InfoModal({
  visible,
  title,
  message,
  variant = 'info',
  dismissLabel = 'Done',
  onDismiss,
}: InfoModalProps) {
  const accent = variant === 'warning' ? WARNING_ACCENT : INFO_ACCENT
  const IconComp = accent.Icon
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.92), [])
  const [mounted, setMounted] = useState(false)
  const [prevVisible, setPrevVisible] = useState(false)

  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setMounted(true)
  }

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
      ]).start(() => setMounted(false))
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
              <IconComp size={16} color={accent.color} weight="fill" />
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onDismiss}>
              <XIcon size={15} color={theme.palette.slate.textSecondary} weight="bold" />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.message} selectable>
              {message}
            </Text>
          </ScrollView>
          <Pressable
            style={[styles.dismissButton, { backgroundColor: accent.buttonBg }]}
            onPress={onDismiss}
          >
            <Text style={styles.dismissText}>{dismissLabel}</Text>
          </Pressable>
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
    maxHeight: 280,
  },
  bodyContent: {
    paddingRight: 2,
  },
  message: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  dismissButton: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
})

import { useEffect, useMemo, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { InfoIcon, XIcon } from 'phosphor-react-native'
import { theme } from '@/constants/theme'

const FADE_DURATION = 120

interface InfoModalProps {
  visible: boolean
  title: string
  message: string
  dismissLabel?: string
  onDismiss: () => void
}

export function InfoModal({
  visible,
  title,
  message,
  dismissLabel = 'Done',
  onDismiss,
}: InfoModalProps) {
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
              <InfoIcon size={16} color={theme.wheel.color} weight="bold" />
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onDismiss}>
              <XIcon size={15} color="#94a3b8" weight="bold" />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.message} selectable>
              {message}
            </Text>
          </ScrollView>
          <Pressable style={styles.dismissButton} onPress={onDismiss}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    backgroundColor: '#131c2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.neutral.surface,
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
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surface,
  },
  body: {
    maxHeight: 280,
  },
  bodyContent: {
    paddingRight: 2,
  },
  message: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  dismissButton: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d4ed8',
  },
  dismissText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
  },
})

import { useEffect, useRef, useState } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/Button'

const FADE_DURATION = 120

interface ConfirmModalProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.92)).current
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (visible) {
      setMounted(true)
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
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button
              style={styles.actionBtn}
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
            />
            <Button
              style={styles.actionBtn}
              label={confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              onPress={onConfirm}
            />
          </View>
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
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#131c2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  message: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
  },
})

import { useEffect, useMemo, useState } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { CheckIcon } from 'phosphor-react-native'
import { Button } from '@/components/ui/base/Button'
import { interaction, theme } from '@/constants/theme'

const POLL_INTERVAL_PRESETS = [
  { ms: 500, label: '500ms (2 Hz)', description: 'Not useful' },
  { ms: 200, label: '200ms (5 Hz)', description: 'Battery saver' },
  { ms: 100, label: '100ms (10 Hz)', description: 'Default' },
  { ms: 50, label: '50ms (20 Hz)', description: 'Fast' },
  { ms: 20, label: '20ms (50 Hz)', description: 'Ultra fast' },
  { ms: 10, label: '10ms (100 Hz)', description: 'Oh my...' },
  { ms: 5, label: '5ms (200 Hz)', description: 'Your phone will explode' },
] as const

export function formatPollInterval(ms: number): string {
  const preset = POLL_INTERVAL_PRESETS.find((p) => p.ms === ms)
  if (preset) return preset.label
  const hz = Math.round(1000 / ms)
  return `${ms}ms (${hz} Hz)`
}

const FADE_DURATION = 120

interface PollIntervalPickerModalProps {
  visible: boolean
  pollIntervalMs: number
  onSelect: (ms: number) => void
  onCancel: () => void
}

export function PollIntervalPickerModal({
  visible,
  pollIntervalMs,
  onSelect,
  onCancel,
}: PollIntervalPickerModalProps) {
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
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>Poll interval</Text>
          <Text style={styles.hint}>Takes effect immediately while connected</Text>
          {POLL_INTERVAL_PRESETS.map((preset, index) => {
            const selected = preset.ms === pollIntervalMs
            const isLast = index === POLL_INTERVAL_PRESETS.length - 1
            return (
              <Pressable
                key={preset.ms}
                style={({ pressed }) => [
                  styles.option,
                  !isLast && styles.optionBorder,
                  pressed && styles.optionPressed,
                ]}
                android_ripple={interaction.ripple}
                onPress={() => onSelect(preset.ms)}
              >
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {preset.label}
                  </Text>
                  <Text style={styles.optionDescription}>{preset.description}</Text>
                </View>
                {selected ? (
                  <CheckIcon size={16} color={theme.highlight.text} weight="bold" />
                ) : null}
              </Pressable>
            )
          })}
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.neutral.modalBackdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: theme.neutral.surfaceDeep,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    padding: 20,
    gap: 4,
  },
  title: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  hint: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.neutral.border,
  },
  optionPressed: {
    opacity: 0.6,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: theme.neutral.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: theme.neutral.textPrimary,
  },
  optionDescription: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  actions: {
    marginTop: 10,
  },
})

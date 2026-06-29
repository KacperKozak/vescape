import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  getModalCoordinateOffset,
  measureTrigger,
  type TriggerLayout,
} from '@/components/ui/overlays/measureTrigger'
import { theme } from '@/constants/theme'

const OPEN_DURATION = 260
const CLOSE_DURATION = 180
const SCREEN_EDGE_PADDING = 10
/** Fraction of the screen height the sheet is allowed to occupy. */
const HEIGHT_FRACTION = 0.6

interface CornerSheetProps {
  visible: boolean
  triggerRef: React.RefObject<View | null>
  onClose: () => void
  /** Which corner the sheet grows from — matches the trigger's screen side. */
  anchor?: 'left' | 'right'
  title?: string
  children: React.ReactNode
}

/**
 * A near-full-width popover "sheet" that drops from a corner trigger and grows
 * out of that corner. Holds interactive tiles (widgets, links) — think of it as
 * a richer, larger sibling of {@link Dropdown}.
 */
export function CornerSheet({
  visible,
  triggerRef,
  onClose,
  anchor = 'left',
  title,
  children,
}: CornerSheetProps) {
  const insets = useSafeAreaInsets()
  const [layout, setLayout] = useState<TriggerLayout | null>(null)
  const [mounted, setMounted] = useState(false)
  const progress = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (!visible) return
    void measureTrigger(triggerRef).then((measured) => {
      setLayout({ ...measured, y: measured.y + getModalCoordinateOffset() })
      setMounted(true)
      progress.setValue(0)
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    })
  }, [visible, triggerRef, progress])

  const handleClose = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMounted(false)
      setLayout(null)
      onClose()
    })
  }, [progress, onClose])

  useEffect(() => {
    if (!visible && mounted) handleClose()
  }, [visible, mounted, handleClose])

  if (!mounted || !layout) return null

  const screen = Dimensions.get('window')
  const screenHeight = screen.height + getModalCoordinateOffset()
  // Anchor the sheet over the trigger so it fully covers the button that opened it.
  const top = Math.max(insets.top, layout.y)
  const left = anchor === 'left' ? layout.x : SCREEN_EDGE_PADDING
  const sheetWidth =
    anchor === 'left'
      ? screen.width - layout.x - SCREEN_EDGE_PADDING
      : layout.x + layout.width - SCREEN_EDGE_PADDING
  const maxHeight = Math.min(
    screenHeight * HEIGHT_FRACTION,
    screenHeight - top - insets.bottom - SCREEN_EDGE_PADDING,
  )
  // Grow from the trigger corner.
  const transformOrigin = anchor === 'left' ? '0% 0%' : '100% 0%'
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] })
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] })

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            top,
            left,
            width: sheetWidth,
            maxHeight,
            transformOrigin,
            opacity: progress,
            transform: [{ scale }, { translateY }],
          },
        ]}
      >
        {title ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>
        ) : null}
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.alpha(theme.palette.mono.black, 0.3),
  },
  sheet: {
    position: 'absolute',
    backgroundColor: theme.alpha(theme.palette.slate.surface, 0.85),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    overflow: 'hidden',
    shadowColor: theme.palette.mono.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: {
    color: theme.palette.slate.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    padding: 12,
    gap: 12,
  },
})

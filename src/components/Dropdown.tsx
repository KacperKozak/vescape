import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '@/constants/theme'

const ANIM_DURATION = 150
const SCREEN_EDGE_PADDING = 8

interface TriggerLayout {
  x: number
  y: number
  width: number
  height: number
}

function getModalCoordinateOffset() {
  if (Platform.OS !== 'android') return 0

  const windowHeight = Dimensions.get('window').height
  const screenHeight = Dimensions.get('screen').height
  return Math.max(0, screenHeight - windowHeight)
}

export function useTriggerRef() {
  return useRef<View>(null)
}

function measureTrigger(ref: React.RefObject<View | null>) {
  return new Promise<TriggerLayout>((resolve) => {
    ref.current?.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height })
    })
  })
}

interface DropdownProps {
  visible: boolean
  triggerRef: React.RefObject<View | null>
  onClose: () => void
  maxHeight?: number
  matchTriggerWidth?: boolean
  minWidth?: number
  children: React.ReactNode
}

export function Dropdown({
  visible,
  triggerRef,
  onClose,
  maxHeight = 380,
  matchTriggerWidth = true,
  minWidth,
  children,
}: DropdownProps) {
  const insets = useSafeAreaInsets()
  const [layout, setLayout] = useState<TriggerLayout | null>(null)
  const [dropAbove, setDropAbove] = useState(false)
  const [mounted, setMounted] = useState(false)
  const opacity = useMemo(() => new Animated.Value(0), [])
  const translateY = useMemo(() => new Animated.Value(-6), [])

  useEffect(() => {
    if (visible) {
      measureTrigger(triggerRef).then((measured) => {
        const modalOffset = getModalCoordinateOffset()
        const triggerLayout = {
          ...measured,
          y: measured.y + modalOffset,
        }
        const screenHeight = Dimensions.get('window').height
        const topSafe = insets.top + SCREEN_EDGE_PADDING
        const bottomSafe = insets.bottom + SCREEN_EDGE_PADDING
        const spaceBelow =
          screenHeight + modalOffset - triggerLayout.y - triggerLayout.height - bottomSafe
        const spaceAbove = triggerLayout.y - topSafe
        const above = spaceBelow < maxHeight && spaceAbove > spaceBelow

        setLayout(triggerLayout)
        setDropAbove(above)
        setMounted(true)

        opacity.setValue(0)
        translateY.setValue(above ? 6 : -6)
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: ANIM_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: ANIM_DURATION,
            useNativeDriver: true,
          }),
        ]).start()
      })
    }
  }, [visible, triggerRef, maxHeight, opacity, translateY, insets.top, insets.bottom])

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: dropAbove ? 6 : -6,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMounted(false)
      setLayout(null)
      onClose()
    })
  }, [opacity, translateY, dropAbove, onClose])

  useEffect(() => {
    if (!visible && mounted) {
      handleClose()
    }
  }, [visible, mounted, handleClose])

  if (!mounted) return null

  const dropdownPosition = layout
    ? (() => {
        const modalOffset = getModalCoordinateOffset()
        const window = Dimensions.get('window')
        const screen = {
          width: window.width,
          height: window.height + modalOffset,
        }
        const topSafe = insets.top + SCREEN_EDGE_PADDING
        const bottomSafe = insets.bottom + SCREEN_EDGE_PADDING
        const availableHeight = screen.height - topSafe - bottomSafe
        const preferredMaxHeight = Math.min(maxHeight, availableHeight)
        const spaceAbove = layout.y - topSafe
        const spaceBelow = screen.height - (layout.y + layout.height) - bottomSafe

        const edgeBoundWidth = screen.width - SCREEN_EDGE_PADDING * 2
        const floatingWidth = Math.min(
          edgeBoundWidth,
          Math.max(layout.width, minWidth ?? Math.min(360, edgeBoundWidth)),
        )
        const centeredLeft = layout.x + layout.width / 2 - floatingWidth / 2
        const clampedLeft = Math.max(
          SCREEN_EDGE_PADDING,
          Math.min(centeredLeft, screen.width - SCREEN_EDGE_PADDING - floatingWidth),
        )

        const shouldDropAbove = spaceBelow < preferredMaxHeight && spaceAbove > spaceBelow
        const sideSpace = shouldDropAbove ? spaceAbove : spaceBelow
        const sideMaxHeight = Math.max(120, Math.min(preferredMaxHeight, sideSpace - 4))

        const position = {
          position: 'absolute' as const,
          maxHeight: sideMaxHeight,
        }

        if (matchTriggerWidth) {
          Object.assign(position, { left: layout.x, width: layout.width })
        } else {
          Object.assign(position, { left: clampedLeft, width: floatingWidth })
        }

        if (shouldDropAbove) {
          const rawBottom = screen.height - layout.y + 4
          Object.assign(position, { bottom: Math.max(bottomSafe, rawBottom) })
        } else {
          const rawTop = layout.y + layout.height + 4
          Object.assign(position, { top: Math.max(topSafe, rawTop) })
        }

        return position
      })()
    : undefined

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
      <Pressable style={styles.backdrop} onPress={handleClose} />
      {layout ? (
        <Animated.View
          style={[styles.panel, dropdownPosition, { opacity, transform: [{ translateY }] }]}
        >
          {children}
        </Animated.View>
      ) : null}
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    backgroundColor: '#131c2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
})

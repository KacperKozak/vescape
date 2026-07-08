import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Reanimated, {
  FadeIn,
  Keyframe,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Icon } from 'phosphor-react-native'

import {
  getModalCoordinateOffset,
  measureTrigger,
  type TriggerLayout,
} from '@/components/ui/overlays/measureTrigger'
import { NativeScrollGestureContext } from '@/components/ui/gestures/NativeScrollGestureContext'
import { theme } from '@/constants/theme'

const OPEN_DURATION = 260
const CLOSE_DURATION = 180
const SCREEN_EDGE_PADDING = 10
/** Fraction of the screen height a sheet is allowed to occupy. */
const HEIGHT_FRACTION = 0.6
/** Continue closing automatically once this many pixels of the drawer remain visible. */
const DRAWER_AUTO_CLOSE_VISIBLE_PX = 200
/** Approximate native fling travel from Android's release velocity in points/ms. */
const DRAWER_FLING_PROJECTION_MS = 250
const DRAWER_OPEN_TRANSLATE_Y = 42
const DRAWER_OPEN_DURATION = 280
const DRAWER_BOTTOM_CONTENT_PADDING = 16
const DRAWER_ENTER_FROM_TOP = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -DRAWER_OPEN_TRANSLATE_Y }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(DRAWER_OPEN_DURATION)
const DRAWER_ENTER_FROM_BOTTOM = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: DRAWER_OPEN_TRANSLATE_Y }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(DRAWER_OPEN_DURATION)

const EdgeDrawerScrollContext = createContext<(() => void) | null>(null)

export function useEdgeDrawerScrollToOpenEdge() {
  return useContext(EdgeDrawerScrollContext)
}
type SheetLayoutMode = {
  mode: 'floating'
  matchTriggerWidth: boolean
  minWidth?: number
}

interface ComputedLayout {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
  transformOrigin: string
  /** translateY the panel animates in from (px). */
  translateFrom: number
}

function computeLayout(
  layoutMode: SheetLayoutMode,
  trigger: TriggerLayout,
  insets: { top: number; bottom: number },
): ComputedLayout {
  const screen = Dimensions.get('window')
  const screenHeight = screen.height + getModalCoordinateOffset()

  // Floating: centered on the trigger, fully covering it — grows down (or, if
  // short on space, up) from the trigger's own edge instead of dropping below it.
  const topSafe = insets.top + SCREEN_EDGE_PADDING
  const bottomSafe = insets.bottom + SCREEN_EDGE_PADDING
  const spaceAbove = trigger.y + trigger.height - topSafe
  const spaceBelow = screenHeight - trigger.y - bottomSafe
  const preferredMaxHeight = screenHeight * HEIGHT_FRACTION
  const dropAbove = spaceBelow < preferredMaxHeight && spaceAbove > spaceBelow
  const maxHeight = Math.max(120, Math.min(preferredMaxHeight, dropAbove ? spaceAbove : spaceBelow))

  const edgeBoundWidth = screen.width - SCREEN_EDGE_PADDING * 2
  const width = layoutMode.matchTriggerWidth
    ? trigger.width
    : Math.min(
        edgeBoundWidth,
        Math.max(trigger.width, layoutMode.minWidth ?? Math.min(360, edgeBoundWidth)),
      )
  const centeredLeft = trigger.x + trigger.width / 2 - width / 2
  const left = Math.max(
    SCREEN_EDGE_PADDING,
    Math.min(centeredLeft, screen.width - SCREEN_EDGE_PADDING - width),
  )

  if (dropAbove) {
    return {
      bottom: Math.max(insets.bottom, screenHeight - (trigger.y + trigger.height)),
      left,
      width,
      maxHeight,
      transformOrigin: '50% 100%',
      translateFrom: 14,
    }
  }
  return {
    top: Math.max(insets.top, trigger.y),
    left,
    width,
    maxHeight,
    transformOrigin: '50% 0%',
    translateFrom: -14,
  }
}

interface SheetProps {
  visible: boolean
  triggerRef: React.RefObject<View | null>
  onClose: () => void
  layout: SheetLayoutMode
  title?: string
  /** Optional glyph shown left of a centred title. */
  icon?: Icon
  contentContainerStyle?: StyleProp<ViewStyle>
  children: React.ReactNode
}

/**
 * Shared chrome for popover-style "sheets": a translucent, dimmed-backdrop
 * panel that scales + slides in from the trigger that opened it. Positioning
 * (grow from a screen corner vs. float centered under the trigger) is picked
 * via `layout`; {@link FloatingSheet} below wires up
 * the two shapes callers actually need.
 */
function Sheet({
  visible,
  triggerRef,
  onClose,
  layout,
  title,
  icon: IconComponent,
  contentContainerStyle,
  children,
}: SheetProps) {
  const insets = useSafeAreaInsets()
  const [triggerLayout, setTriggerLayout] = useState<TriggerLayout | null>(null)
  const [mounted, setMounted] = useState(false)
  const progress = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (!visible) return
    void measureTrigger(triggerRef).then((measured) => {
      setTriggerLayout({
        ...measured,
        y: measured.y + getModalCoordinateOffset(),
      })
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
      setTriggerLayout(null)
      onClose()
    })
  }, [progress, onClose])

  useEffect(() => {
    if (!visible && mounted) handleClose()
  }, [visible, mounted, handleClose])

  if (!mounted || !triggerLayout) return null

  const computed = computeLayout(layout, triggerLayout, insets)
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  })
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [computed.translateFrom, 0],
  })

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
            top: computed.top,
            bottom: computed.bottom,
            left: computed.left,
            width: computed.width,
            maxHeight: computed.maxHeight,
            transformOrigin: computed.transformOrigin,
            opacity: progress,
            transform: [{ scale }, { translateY }],
          },
        ]}
      >
        {title ? (
          <View style={styles.header}>
            {IconComponent ? (
              <IconComponent size={18} color={theme.palette.slate.textSecondary} weight="duotone" />
            ) : null}
            <Text style={styles.title}>{title}</Text>
          </View>
        ) : null}
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

interface EdgeDrawerProps {
  visible: boolean
  triggerRef: React.RefObject<View | null>
  onClose: () => void
  /** Override edge selection. `auto` chooses the edge nearest the trigger. */
  edge?: 'auto' | 'top' | 'bottom'
  title?: string
  /** Optional glyph shown left of a centred title. */
  icon?: Icon
  children: React.ReactNode
}

/**
 * A full-width edge drawer. It opens from the edge nearest its trigger and can
 * be dragged back toward that edge to dismiss.
 */
// Reanimated shared values are mutable handles by design. React's immutability
// lint cannot distinguish their UI-thread writes from React-owned state.
/* eslint-disable react-hooks/immutability */
export function EdgeDrawer({
  visible,
  triggerRef,
  onClose,
  edge = 'auto',
  title,
  icon: IconComponent,
  children,
}: EdgeDrawerProps) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [mounted, setMounted] = useState(false)
  const [opensFromTop, setOpensFromTop] = useState(true)
  const [dismissRange, setDismissRange] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const positionedRef = useRef(false)
  const dismissRangeRef = useRef(0)
  const scrollOffset = useSharedValue(0)
  const animatedDismissRange = useSharedValue(1)
  const nativeScrollGesture = useMemo(() => Gesture.Native(), [])

  useEffect(() => {
    if (!visible) return

    const openFrom = (fromTop: boolean) => {
      setOpensFromTop(fromTop)
      setMounted(true)
      setDismissRange(0)
      dismissRangeRef.current = 0
      positionedRef.current = false
      scrollOffset.value = 0
    }

    if (edge !== 'auto') {
      openFrom(edge === 'top')
      return
    }

    void measureTrigger(triggerRef).then((trigger) => {
      openFrom(trigger.y + trigger.height / 2 < height / 2)
    })
  }, [edge, height, scrollOffset, triggerRef, visible])

  const finishClose = useCallback(() => {
    setMounted(false)
    setDismissRange(0)
    onClose()
  }, [onClose])

  const close = useCallback(() => {
    if (dismissRange <= 0) {
      requestAnimationFrame(finishClose)
      return
    }
    scrollRef.current?.scrollTo({
      y: opensFromTop ? dismissRange : 0,
      animated: true,
    })
  }, [dismissRange, finishClose, opensFromTop])

  useEffect(() => {
    if (!visible && mounted) close()
  }, [close, mounted, visible])

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y
    },
  })

  const backdropStyle = useAnimatedStyle(() => {
    const visibleFraction = opensFromTop
      ? 1 - scrollOffset.value / animatedDismissRange.value
      : scrollOffset.value / animatedDismissRange.value
    return { opacity: Math.max(0, Math.min(1, visibleFraction)) }
  })

  const handleContentSizeChange = useCallback(
    (_contentWidth: number, contentHeight: number) => {
      const previousRange = dismissRangeRef.current
      const range = Math.max(1, contentHeight - height)
      setDismissRange(range)
      dismissRangeRef.current = range
      animatedDismissRange.value = range

      if (!positionedRef.current) {
        positionedRef.current = true
        const initialOffset = opensFromTop ? 0 : range
        scrollOffset.value = initialOffset
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: initialOffset, animated: false })
        })
        return
      }

      const bottomDrawerWasFullyOpen = !opensFromTop && scrollOffset.value >= previousRange - 1
      if (bottomDrawerWasFullyOpen && range > previousRange) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: range, animated: true })
        })
      }
    },
    [animatedDismissRange, height, opensFromTop, scrollOffset],
  )

  const shouldAutoCloseAtOffset = useCallback(
    (offset: number) => {
      const visiblePixels = opensFromTop ? dismissRange - offset : offset
      const autoCloseThreshold = Math.min(DRAWER_AUTO_CLOSE_VISIBLE_PX, dismissRange / 2)
      return visiblePixels <= autoCloseThreshold
    },
    [dismissRange, opensFromTop],
  )

  const scrollFullyOut = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: opensFromTop ? dismissRange : 0,
      animated: true,
    })
  }, [dismissRange, opensFromTop])

  const scrollToOpenEdge = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: opensFromTop ? 0 : dismissRangeRef.current + height,
      animated: true,
    })
  }, [height, opensFromTop])

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y
      const fullyHidden = opensFromTop ? offset >= dismissRange - 1 : offset <= 1
      if (fullyHidden) {
        finishClose()
        return
      }

      if (shouldAutoCloseAtOffset(offset)) scrollFullyOut()
    },
    [dismissRange, finishClose, opensFromTop, scrollFullyOut, shouldAutoCloseAtOffset],
  )

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, targetContentOffset, velocity } = event.nativeEvent
      const projectedOffset =
        targetContentOffset?.y ?? contentOffset.y - (velocity?.y ?? 0) * DRAWER_FLING_PROJECTION_MS

      if (shouldAutoCloseAtOffset(projectedOffset)) {
        scrollFullyOut()
        return
      }

      handleScrollEnd(event)
    },
    [handleScrollEnd, scrollFullyOut, shouldAutoCloseAtOffset],
  )

  if (!mounted) return null

  const edgePadding = opensFromTop ? insets.top : insets.bottom + DRAWER_BOTTOM_CONTENT_PADDING
  const vignetteColor = theme.palette.slate.surfaceDeep
  const gradientColors = opensFromTop
    ? [
        theme.alpha(vignetteColor, 1),
        theme.alpha(vignetteColor, 0.8),
        theme.alpha(vignetteColor, 0.6),
      ]
    : [
        theme.alpha(vignetteColor, 0.6),
        theme.alpha(vignetteColor, 0.8),
        theme.alpha(vignetteColor, 1),
      ]
  const emptyDismissArea = <Pressable style={{ height }} onPress={close} accessible={false} />

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <GestureHandlerRootView style={styles.modalGestureRoot}>
        <Reanimated.View entering={FadeIn.duration(DRAWER_OPEN_DURATION)} style={styles.drawer}>
          <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Rect x={0} y={0} width={width} height={height}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, height)}
                  colors={gradientColors}
                  positions={[0, 0.7, 1]}
                />
              </Rect>
            </Canvas>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </Reanimated.View>
        </Reanimated.View>
        <Reanimated.View
          entering={opensFromTop ? DRAWER_ENTER_FROM_TOP : DRAWER_ENTER_FROM_BOTTOM}
          style={styles.drawer}
        >
          <NativeScrollGestureContext.Provider value={nativeScrollGesture}>
            <GestureDetector gesture={nativeScrollGesture}>
              <Reanimated.ScrollView
                ref={scrollRef}
                onContentSizeChange={handleContentSizeChange}
                onScroll={scrollHandler}
                onScrollEndDrag={handleScrollEndDrag}
                onMomentumScrollEnd={handleScrollEnd}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
              >
                {!opensFromTop ? emptyDismissArea : null}
                <View
                  style={[
                    styles.drawerBody,
                    opensFromTop ? { paddingTop: edgePadding } : { paddingBottom: edgePadding },
                  ]}
                >
                  {!opensFromTop ? <View style={styles.grabber} /> : null}
                  {title ? (
                    <Pressable
                      style={styles.drawerHeader}
                      onPress={close}
                      accessibilityRole="button"
                      accessibilityLabel={`Close ${title}`}
                    >
                      {IconComponent ? (
                        <IconComponent
                          size={28}
                          color={theme.palette.slate.textSecondary}
                          weight="duotone"
                        />
                      ) : null}
                      <Text style={styles.drawerTitle}>{title}</Text>
                    </Pressable>
                  ) : null}
                  <EdgeDrawerScrollContext.Provider value={scrollToOpenEdge}>
                    <View style={styles.drawerContent}>{children}</View>
                  </EdgeDrawerScrollContext.Provider>
                  {opensFromTop ? <View style={styles.grabber} /> : null}
                </View>
                {opensFromTop ? emptyDismissArea : null}
              </Reanimated.ScrollView>
            </GestureDetector>
          </NativeScrollGestureContext.Provider>
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}
/* eslint-enable react-hooks/immutability */

interface FloatingSheetProps {
  visible: boolean
  triggerRef: React.RefObject<View | null>
  onClose: () => void
  matchTriggerWidth?: boolean
  minWidth?: number
  title?: string
  contentContainerStyle?: StyleProp<ViewStyle>
  children: React.ReactNode
}

/**
 * A compact popover that floats centered under (or above, if short on space)
 * its trigger — same translucent/animated feel as {@link EdgeDrawer}, sized
 * to its content instead of growing from a screen corner.
 */
export function FloatingSheet({
  matchTriggerWidth = true,
  minWidth,
  ...props
}: FloatingSheetProps) {
  return <Sheet {...props} layout={{ mode: 'floating', matchTriggerWidth, minWidth }} />
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
    justifyContent: 'center',
    gap: 6,
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
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalGestureRoot: {
    flex: 1,
  },
  drawerBody: {
    paddingHorizontal: 12,
    gap: 10,
  },
  drawerHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  drawerTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 22,
    fontWeight: '300',
  },
  drawerContent: {
    gap: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.alpha(theme.palette.slate.textSecondary, 0.6),
    marginVertical: 3,
  },
})

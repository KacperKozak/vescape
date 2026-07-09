import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/components/ui/base/Text'
import { PlusIcon } from 'phosphor-react-native'
import type { Icon } from 'phosphor-react-native'

import { Dropdown, useTriggerRef } from '@/components/ui/forms/Dropdown'
import { theme } from '@/constants/theme'

interface ActiveTheme {
  bg: string
  border: string
  color: string
}

interface MenuState {
  triggerRef: React.RefObject<View | null>
  content: ReactNode
}

interface PillSelectorCtx {
  activeId: string
  openMenu: (id: string, triggerRef: React.RefObject<View | null>, content: ReactNode) => void
  closeMenu: () => void
  addRef: React.RefObject<View | null>
  contained: boolean
}

const PillSelectorContext = createContext<PillSelectorCtx | null>(null)
const TUNE_OPTION_WIDTH = 38
const TUNE_ACTIVE_WIDTH = 112
const TUNE_ANIMATION = { duration: 180 } as const
const AnimatedText = Animated.createAnimatedComponent(Text)

function usePillSelectorCtx() {
  const ctx = useContext(PillSelectorContext)
  if (!ctx) throw new Error('PillSelectorItem must be inside PillSelector')
  return ctx
}

interface PillSelectorProps {
  activeId: string
  children: ReactNode
  contained?: boolean
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
}

export function PillSelector({
  activeId,
  children,
  contained = false,
  style,
  contentContainerStyle,
}: PillSelectorProps) {
  'use no memo'
  const [menu, setMenu] = useState<MenuState | null>(null)
  const addRef = useTriggerRef()

  const openMenu = useCallback(
    (_id: string, triggerRef: React.RefObject<View | null>, content: ReactNode) => {
      setMenu({ triggerRef, content })
    },
    [],
  )

  const closeMenu = useCallback(() => setMenu(null), [])

  const centered = (() => {
    const count = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0
    return count <= 3
  })()

  return (
    <PillSelectorContext.Provider value={{ activeId, openMenu, closeMenu, addRef, contained }}>
      <View style={[styles.container, contained && styles.containedContainer, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            contained && styles.containedScrollContent,
            centered && styles.scrollContentCentered,
            contentContainerStyle,
          ]}
        >
          {children}
        </ScrollView>

        <Dropdown
          visible={menu != null}
          triggerRef={menu?.triggerRef ?? addRef}
          onClose={closeMenu}
          matchTriggerWidth={false}
          minWidth={160}
          maxHeight={220}
        >
          {menu?.content}
        </Dropdown>
      </View>
    </PillSelectorContext.Provider>
  )
}

interface PillSelectorItemProps {
  id: string
  label: string
  icon?: Icon
  activeLabelOnly?: boolean
  badge?: ReactNode
  color?: ActiveTheme
  testID?: string
  onPress: () => void
  children?: ReactNode
}

export function PillSelectorItem({
  id,
  label,
  icon: IconComp,
  activeLabelOnly,
  badge,
  color,
  testID,
  onPress,
  children,
}: PillSelectorItemProps) {
  const { activeId, contained, openMenu, closeMenu } = usePillSelectorCtx()
  const pillRef = useRef<View>(null)
  const active = id === activeId
  const showLabel = !activeLabelOnly || active
  const accentBg = color?.bg ?? theme.palette.green.bg
  const accentBorder = color?.border ?? theme.palette.green.border
  const accentColor = color?.color ?? theme.palette.green.color
  const inactiveAccent = theme.alpha(accentColor, 0.6)
  const activeProgress = useSharedValue(active ? 1 : 0)
  const labelProgress = useSharedValue(showLabel ? 1 : 0)

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, TUNE_ANIMATION)
  }, [active, activeProgress])

  useEffect(() => {
    labelProgress.value = withTiming(showLabel ? 1 : 0, TUNE_ANIMATION)
  }, [labelProgress, showLabel])

  const frameStyle = useAnimatedStyle(
    () => ({
      width: activeLabelOnly
        ? TUNE_OPTION_WIDTH + (TUNE_ACTIVE_WIDTH - TUNE_OPTION_WIDTH) * activeProgress.value
        : undefined,
      backgroundColor: interpolateColor(
        activeProgress.value,
        [0, 1],
        [
          contained ? theme.alpha(theme.palette.mono.black, 0) : theme.palette.slate.surface,
          accentBg,
        ],
      ),
      borderColor: interpolateColor(
        activeProgress.value,
        [0, 1],
        [
          contained ? theme.alpha(theme.palette.mono.black, 0) : theme.palette.slate.border,
          accentBorder,
        ],
      ),
    }),
    [accentBg, accentBorder, activeLabelOnly, contained],
  )
  const labelStyle = useAnimatedStyle(
    () => ({
      opacity: labelProgress.value,
      maxWidth: TUNE_ACTIVE_WIDTH * labelProgress.value,
      marginLeft: (IconComp ? 6 : 0) * labelProgress.value,
    }),
    [IconComp],
  )

  const hasMenu = !!children
  const longPressedRef = useRef(false)

  const handleLongPress = useCallback(() => {
    if (!hasMenu) return
    longPressedRef.current = true
    const menuContent = <View style={styles.menu}>{children}</View>
    openMenu(id, pillRef, menuContent)
  }, [id, children, hasMenu, openMenu])

  return (
    <Animated.View
      ref={pillRef}
      style={[
        styles.pill,
        activeLabelOnly && styles.iconPill,
        contained && styles.containedPill,
        frameStyle,
      ]}
    >
      <Pressable
        testID={testID}
        style={styles.pillPressable}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (longPressedRef.current) {
            longPressedRef.current = false
            return
          }
          closeMenu()
          onPress()
        }}
        onLongPress={hasMenu ? handleLongPress : undefined}
        delayLongPress={400}
      >
        {IconComp ? (
          <IconComp
            size={activeLabelOnly ? 18 : 13}
            color={active ? accentColor : inactiveAccent}
            weight="duotone"
          />
        ) : null}
        {activeLabelOnly ? (
          <AnimatedText
            style={[
              styles.pillText,
              active ? { color: accentColor, fontWeight: '800' } : { color: inactiveAccent },
              labelStyle,
            ]}
            numberOfLines={1}
          >
            {label}
          </AnimatedText>
        ) : showLabel ? (
          <Text
            style={[
              styles.pillText,
              active ? { color: accentColor, fontWeight: '800' } : { color: inactiveAccent },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
        {badge ?? null}
      </Pressable>
    </Animated.View>
  )
}

interface PillSelectorAddProps {
  testID?: string
  onPress: () => void
}

export function PillSelectorAdd({ testID, onPress }: PillSelectorAddProps) {
  const { addRef, contained } = usePillSelectorCtx()
  return (
    <Pressable
      ref={addRef}
      testID={testID}
      style={[styles.addPill, contained && styles.containedAddPill]}
      onPress={onPress}
    >
      <PlusIcon size={14} color={theme.palette.slate.color} weight="bold" />
    </Pressable>
  )
}

interface PillSelectorMenuItemProps {
  icon: Icon
  label: string
  testID?: string
  onPress: () => void
  danger?: boolean
  separator?: boolean
}

export function PillSelectorMenuItem({
  icon: IconComp,
  label,
  testID,
  onPress,
  danger,
  separator,
}: PillSelectorMenuItemProps) {
  const { closeMenu } = usePillSelectorCtx()
  return (
    <Pressable
      testID={testID}
      style={[styles.menuItem, separator && styles.menuItemSeparator]}
      onPress={() => {
        closeMenu()
        onPress()
      }}
    >
      <IconComp
        size={15}
        color={danger ? theme.status.error.text : theme.palette.slate.textSecondary}
        weight="bold"
      />
      <Text style={[styles.menuItemText, danger && styles.menuItemTextDanger]}>{label}</Text>
    </Pressable>
  )
}

export interface PillSelectorDotProps {
  status: 'draft' | 'enabled' | 'disabled'
}

export function PillSelectorDot({ status }: PillSelectorDotProps) {
  if (status === 'draft') return <View style={styles.draftDot} />
  if (status === 'enabled') return <View style={styles.enabledDot} />
  return <View style={styles.disabledDot} />
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: -16,
  },
  containedContainer: {
    height: 38,
    marginHorizontal: 0,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    minWidth: '100%',
  },
  containedScrollContent: {
    minWidth: 0,
    height: 36,
    paddingHorizontal: 1,
    gap: 0,
  },
  scrollContentCentered: {
    justifyContent: 'center',
  },
  pill: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    maxWidth: 160,
  },
  iconPill: {
    height: TUNE_OPTION_WIDTH,
    width: TUNE_OPTION_WIDTH,
    maxWidth: TUNE_ACTIVE_WIDTH,
    paddingHorizontal: 0,
    borderRadius: TUNE_OPTION_WIDTH / 2,
    overflow: 'hidden',
  },
  containedPill: {
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
  },
  pillPressable: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillTextInactive: {
    color: theme.palette.slate.textSecondary,
  },
  addPill: {
    height: 36,
    width: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.palette.slate.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containedAddPill: {
    borderWidth: 0,
    borderStyle: 'solid',
    backgroundColor: theme.alpha(theme.palette.mono.black, 0),
  },
  menu: {
    paddingVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  menuItemSeparator: {
    borderTopWidth: 1,
    borderTopColor: theme.palette.slate.surface,
  },
  menuItemText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  menuItemTextDanger: {
    color: theme.status.error.text,
  },
  draftDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.palette.slate.textDim,
  },
  enabledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.palette.green.color,
  },
  disabledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: theme.palette.slate.textDim,
  },
})

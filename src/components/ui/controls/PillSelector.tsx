import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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
}

const PillSelectorContext = createContext<PillSelectorCtx | null>(null)

function usePillSelectorCtx() {
  const ctx = useContext(PillSelectorContext)
  if (!ctx) throw new Error('PillSelectorItem must be inside PillSelector')
  return ctx
}

interface PillSelectorProps {
  activeId: string
  children: ReactNode
}

export function PillSelector({ activeId, children }: PillSelectorProps) {
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
    <PillSelectorContext.Provider value={{ activeId, openMenu, closeMenu, addRef }}>
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, centered && styles.scrollContentCentered]}
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
  badge,
  color,
  testID,
  onPress,
  children,
}: PillSelectorItemProps) {
  const { activeId, openMenu, closeMenu } = usePillSelectorCtx()
  const pillRef = useRef<View>(null)
  const active = id === activeId
  const accentBg = color?.bg ?? theme.palette.green.bg
  const accentBorder = color?.border ?? theme.palette.green.border
  const accentColor = color?.color ?? theme.palette.green.color

  const hasMenu = !!children
  const longPressedRef = useRef(false)

  const handleLongPress = useCallback(() => {
    if (!hasMenu) return
    longPressedRef.current = true
    const menuContent = <View style={styles.menu}>{children}</View>
    openMenu(id, pillRef, menuContent)
  }, [id, children, hasMenu, openMenu])

  return (
    <Pressable
      ref={pillRef}
      testID={testID}
      style={[
        styles.pill,
        active ? { backgroundColor: accentBg, borderColor: accentBorder } : styles.pillInactive,
      ]}
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
          size={13}
          color={active ? accentColor : theme.palette.slate.textMuted}
          weight="fill"
        />
      ) : null}
      <Text
        style={[
          styles.pillText,
          active ? { color: accentColor, fontWeight: '800' } : styles.pillTextInactive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {badge ?? null}
    </Pressable>
  )
}

interface PillSelectorAddProps {
  testID?: string
  onPress: () => void
}

export function PillSelectorAdd({ testID, onPress }: PillSelectorAddProps) {
  const { addRef } = usePillSelectorCtx()
  return (
    <Pressable ref={addRef} testID={testID} style={styles.addPill} onPress={onPress}>
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
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    minWidth: '100%',
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
  pillInactive: {
    backgroundColor: theme.palette.slate.surface,
    borderColor: theme.palette.slate.border,
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

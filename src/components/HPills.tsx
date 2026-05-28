import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { PlusIcon, TrashIcon } from 'phosphor-react-native'
import type { Icon } from 'phosphor-react-native'

import { Dropdown, useTriggerRef } from '@/components/Dropdown'
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

interface HPillsCtx {
  activeId: string
  openMenu: (id: string, triggerRef: React.RefObject<View | null>, content: ReactNode) => void
  closeMenu: () => void
  addRef: React.RefObject<View | null>
}

const HPillsContext = createContext<HPillsCtx | null>(null)

function useHPillsCtx() {
  const ctx = useContext(HPillsContext)
  if (!ctx) throw new Error('HPill must be inside HPills')
  return ctx
}

interface HPillsProps {
  activeId: string
  children: ReactNode
}

export function HPills({ activeId, children }: HPillsProps) {
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
    <HPillsContext.Provider value={{ activeId, openMenu, closeMenu, addRef }}>
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
    </HPillsContext.Provider>
  )
}

interface HPillProps {
  id: string
  label: string
  icon?: Icon
  badge?: ReactNode
  color?: ActiveTheme
  onPress: () => void
  children?: ReactNode
}

export function HPill({ id, label, icon: IconComp, badge, color, onPress, children }: HPillProps) {
  const { activeId, openMenu, closeMenu } = useHPillsCtx()
  const pillRef = useRef<View>(null)
  const active = id === activeId
  const accentBg = color?.bg ?? theme.gps.bg
  const accentBorder = color?.border ?? theme.gps.border
  const accentColor = color?.color ?? theme.gps.color

  const hasMenu = !!children

  const handleLongPress = useCallback(() => {
    if (!hasMenu) return
    const menuContent = <View style={styles.menu}>{children}</View>
    openMenu(id, pillRef, menuContent)
  }, [id, children, hasMenu, openMenu])

  return (
    <Pressable
      ref={pillRef}
      style={[
        styles.pill,
        active ? { backgroundColor: accentBg, borderColor: accentBorder } : styles.pillInactive,
      ]}
      onPress={() => {
        closeMenu()
        onPress()
      }}
      onLongPress={hasMenu ? handleLongPress : undefined}
      delayLongPress={400}
    >
      {IconComp ? (
        <IconComp size={13} color={active ? accentColor : theme.neutral.textMuted} weight="fill" />
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

interface HPillAddProps {
  onPress: () => void
}

export function HPillAdd({ onPress }: HPillAddProps) {
  const { addRef } = useHPillsCtx()
  return (
    <Pressable ref={addRef} style={styles.addPill} onPress={onPress}>
      <PlusIcon size={14} color="#64748b" weight="bold" />
    </Pressable>
  )
}

interface HPillMenuItemProps {
  icon: Icon
  label: string
  onPress: () => void
  danger?: boolean
  separator?: boolean
}

export function HPillMenuItem({
  icon: IconComp,
  label,
  onPress,
  danger,
  separator,
}: HPillMenuItemProps) {
  const { closeMenu } = useHPillsCtx()
  return (
    <Pressable
      style={[styles.menuItem, separator && styles.menuItemSeparator]}
      onPress={() => {
        closeMenu()
        onPress()
      }}
    >
      <IconComp
        size={15}
        color={danger ? theme.error.text : theme.neutral.textSecondary}
        weight="bold"
      />
      <Text style={[styles.menuItemText, danger && styles.menuItemTextDanger]}>{label}</Text>
    </Pressable>
  )
}

export interface HPillDotProps {
  status: 'draft' | 'enabled' | 'disabled'
}

export function HPillDot({ status }: HPillDotProps) {
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
    backgroundColor: theme.neutral.surface,
    borderColor: theme.neutral.border,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillTextInactive: {
    color: theme.neutral.textSecondary,
  },
  addPill: {
    height: 36,
    width: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.neutral.border,
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
    borderTopColor: theme.neutral.surface,
  },
  menuItemText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  menuItemTextDanger: {
    color: theme.error.text,
  },
  draftDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.neutral.textDim,
  },
  enabledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  disabledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: theme.neutral.textDim,
  },
})

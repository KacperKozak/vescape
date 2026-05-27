import { useCallback, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  BriefcaseIcon,
  HouseIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  type Icon,
} from 'phosphor-react-native'

import { Dropdown, useTriggerRef } from '@/components/Dropdown'
import { theme } from '@/constants/theme'
import type { PrivacyZone } from '@/store/privacyZoneStore'

export interface ZonePill {
  id: string
  name: string
  isBuiltIn: boolean
  isSaved: boolean
  enabled: boolean
  icon?: Icon
}

interface ZonePillsProps {
  pills: ZonePill[]
  selectedId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRename: (id: string, currentName: string) => void
  onDelete: (id: string) => void
}

interface ContextMenu {
  id: string
  name: string
  isBuiltIn: boolean
  triggerRef: React.RefObject<View | null>
}

export function buildZonePills(
  zones: PrivacyZone[],
  pendingCustom?: PendingCustomZone | null,
): ZonePill[] {
  const homeZone = zones.find((z) => z.preset === 'home')
  const workZone = zones.find((z) => z.preset === 'work')

  const pills: ZonePill[] = [
    {
      id: 'home',
      name: 'Home',
      isBuiltIn: true,
      isSaved: !!homeZone,
      enabled: homeZone?.enabled ?? false,
      icon: HouseIcon,
    },
    {
      id: 'work',
      name: 'Work',
      isBuiltIn: true,
      isSaved: !!workZone,
      enabled: workZone?.enabled ?? false,
      icon: BriefcaseIcon,
    },
  ]

  for (const z of zones) {
    if (z.preset === 'custom') {
      pills.push({ id: z.id, name: z.name, isBuiltIn: false, isSaved: true, enabled: z.enabled })
    }
  }

  if (pendingCustom && !zones.some((z) => z.id === pendingCustom.id)) {
    pills.push({
      id: pendingCustom.id,
      name: pendingCustom.name,
      isBuiltIn: false,
      isSaved: false,
      enabled: false,
    })
  }

  return pills
}

export interface PendingCustomZone {
  id: string
  name: string
}

export function ZonePills({
  pills,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: ZonePillsProps) {
  'use no memo'
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const pillRefs = useRef<Map<string, React.RefObject<View | null>>>(new Map())
  const addRef = useTriggerRef()

  function getPillRef(id: string): React.RefObject<View | null> {
    if (!pillRefs.current.has(id)) {
      pillRefs.current.set(id, { current: null })
    }
    return pillRefs.current.get(id)!
  }

  const handleLongPress = useCallback((pill: ZonePill) => {
    if (!pill.isSaved) return
    const ref = getPillRef(pill.id)
    setContextMenu({ id: pill.id, name: pill.name, isBuiltIn: pill.isBuiltIn, triggerRef: ref })
  }, [])

  const closeMenu = useCallback(() => setContextMenu(null), [])

  const centered = pills.length <= 3

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, centered && styles.scrollContentCentered]}
      >
        {/* eslint-disable-next-line react-hooks/refs -- ref map read is stable, not reactive */}
        {pills.map((pill) => {
          const active = pill.id === selectedId
          const ref = getPillRef(pill.id)
          return (
            <Pressable
              key={pill.id}
              ref={ref as React.RefObject<View>}
              style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
              onPress={() => onSelect(pill.id)}
              onLongPress={() => handleLongPress(pill)}
              delayLongPress={400}
            >
              {pill.icon ? (
                <pill.icon size={13} color={active ? theme.gps.color : '#64748b'} weight="fill" />
              ) : null}
              <Text
                style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}
                numberOfLines={1}
              >
                {pill.name}
              </Text>
              {!pill.isSaved ? (
                <View style={styles.draftDot} />
              ) : (
                <View style={pill.enabled ? styles.enabledDot : styles.disabledDot} />
              )}
            </Pressable>
          )
        })}

        <Pressable ref={addRef} style={styles.addPill} onPress={onAdd}>
          <PlusIcon size={14} color="#64748b" weight="bold" />
        </Pressable>
      </ScrollView>

      <Dropdown
        visible={contextMenu != null}
        triggerRef={contextMenu?.triggerRef ?? addRef}
        onClose={closeMenu}
        matchTriggerWidth={false}
        minWidth={160}
        maxHeight={160}
      >
        {contextMenu ? (
          <View style={styles.menu}>
            {!contextMenu.isBuiltIn ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  closeMenu()
                  onRename(contextMenu.id, contextMenu.name)
                }}
              >
                <PencilSimpleIcon size={15} color="#94a3b8" weight="bold" />
                <Text style={styles.menuItemText}>Rename</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.menuItem, !contextMenu.isBuiltIn && styles.menuItemDanger]}
              onPress={() => {
                closeMenu()
                onDelete(contextMenu.id)
              }}
            >
              <TrashIcon size={15} color={theme.error.text} weight="bold" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </Dropdown>
    </View>
  )
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
  pillActive: {
    backgroundColor: theme.gps.bg,
    borderColor: theme.gps.border,
  },
  pillInactive: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillTextActive: {
    color: theme.gps.color,
    fontWeight: '800',
  },
  pillTextInactive: {
    color: '#94a3b8',
  },
  draftDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#475569',
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
    borderColor: '#475569',
  },
  addPill: {
    height: 36,
    width: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#334155',
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
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  menuItemText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  menuItemTextDanger: {
    color: theme.error.text,
  },
})

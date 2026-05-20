import { useCallback, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CopyIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from 'phosphor-react-native'
import type { TuneProfile } from 'vesc-ble'

import { Dropdown, measureTrigger, useTriggerRef } from '@/components/Dropdown'
import { theme } from '@/constants/theme'

interface ProfilePillsProps {
  profiles: TuneProfile[]
  activeProfileId: string | null
  canDelete: boolean
  hasOtherBoards: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (profile: TuneProfile) => void
  onDelete: (profile: TuneProfile) => void
  onCopy: (profile: TuneProfile) => void
}

interface ContextMenu {
  profile: TuneProfile
  triggerRef: React.RefObject<View | null>
}

export function ProfilePills({
  profiles,
  activeProfileId,
  canDelete,
  hasOtherBoards,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onCopy,
}: ProfilePillsProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const pillRefs = useRef<Map<string, React.RefObject<View | null>>>(new Map())
  const addRef = useTriggerRef()

  function getPillRef(id: string): React.RefObject<View | null> {
    if (!pillRefs.current.has(id)) {
      pillRefs.current.set(id, { current: null })
    }
    return pillRefs.current.get(id)!
  }

  const handleLongPress = useCallback(
    (profile: TuneProfile) => {
      const ref = getPillRef(profile.id)
      setContextMenu({ profile, triggerRef: ref })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const closeMenu = useCallback(() => setContextMenu(null), [])

  const centered = profiles.length <= 3

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, centered && styles.scrollContentCentered]}
      >
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId
          const ref = getPillRef(profile.id)
          return (
            <Pressable
              key={profile.id}
              ref={ref as React.RefObject<View>}
              style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
              onPress={() => onSelect(profile.id)}
              onLongPress={() => handleLongPress(profile)}
              delayLongPress={400}
            >
              <Text
                style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}
                numberOfLines={1}
              >
                {profile.name}
              </Text>
            </Pressable>
          )
        })}

        <Pressable ref={addRef} style={styles.addPill} onPress={onCreate}>
          <PlusIcon size={14} color="#64748b" weight="bold" />
        </Pressable>
      </ScrollView>

      <Dropdown
        visible={contextMenu != null}
        triggerRef={contextMenu?.triggerRef ?? addRef}
        onClose={closeMenu}
        matchTriggerWidth={false}
        minWidth={180}
        maxHeight={220}
      >
        {contextMenu ? (
          <View style={styles.menu}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                closeMenu()
                onRename(contextMenu.profile)
              }}
            >
              <PencilSimpleIcon size={15} color="#94a3b8" weight="bold" />
              <Text style={styles.menuItemText}>Rename</Text>
            </Pressable>
            {hasOtherBoards ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  closeMenu()
                  onCopy(contextMenu.profile)
                }}
              >
                <CopyIcon size={15} color="#94a3b8" weight="bold" />
                <Text style={styles.menuItemText}>Copy to board</Text>
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable
                style={[styles.menuItem, styles.menuItemDanger]}
                onPress={() => {
                  closeMenu()
                  onDelete(contextMenu.profile)
                }}
              >
                <TrashIcon size={15} color={theme.error.text} weight="bold" />
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete</Text>
              </Pressable>
            ) : null}
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
    maxWidth: 160,
  },
  pillActive: {
    backgroundColor: theme.wheel.bg,
    borderColor: theme.wheel.border,
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
    color: theme.wheel.color,
    fontWeight: '800',
  },
  pillTextInactive: {
    color: '#94a3b8',
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

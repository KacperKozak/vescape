import { useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { DotsThreeVerticalIcon, type Icon } from 'phosphor-react-native'

export interface BoardMenuItem {
  label: string
  icon: Icon
  onPress: () => void
  destructive?: boolean
  separator?: boolean
}

function DropdownMenu({
  items,
  anchor,
  onClose,
}: {
  items: BoardMenuItem[]
  anchor: { top: number; right: number }
  onClose: () => void
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[dropStyles.menu, { top: anchor.top, right: anchor.right }]}>
        {items.map((item, i) => (
          <View key={item.label}>
            {item.separator && i > 0 && <View style={dropStyles.separator} />}
            <Pressable
              style={dropStyles.item}
              onPress={() => {
                onClose()
                item.onPress()
              }}
            >
              <item.icon
                size={18}
                color={item.destructive ? '#f87171' : '#9ca3af'}
                weight="regular"
              />
              <Text style={[dropStyles.label, item.destructive && dropStyles.destructive]}>
                {item.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Modal>
  )
}

export function BoardMenu({ items }: { items: BoardMenuItem[] }) {
  const menuButtonRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)

  if (items.length === 0) return null

  const openMenu = () => {
    menuButtonRef.current?.measure((_x, _y, _w, h, _px, pageY) => {
      setAnchor({ top: pageY + h + 4, right: 12 })
    })
  }

  return (
    <>
      <View ref={menuButtonRef} collapsable={false}>
        <Pressable style={styles.menuButton} onPress={openMenu}>
          <DotsThreeVerticalIcon size={22} color="#9ca3af" weight="bold" />
        </Pressable>
      </View>

      {anchor && <DropdownMenu items={items} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  )
}

const styles = StyleSheet.create({
  menuButton: { paddingHorizontal: 8, paddingVertical: 4 },
})

const dropStyles = StyleSheet.create({
  menu: {
    position: 'absolute',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  label: { color: '#f1f5f9', fontSize: 15 },
  destructive: { color: '#f87171' },
  separator: { height: 1, backgroundColor: '#334155', marginHorizontal: 0 },
})

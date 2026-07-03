import { Children, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { CaretDownIcon } from 'phosphor-react-native'

import { theme } from '@/constants/theme'

interface TuneGroupGridProps {
  title: string
  subtitle?: string
  collapsible?: boolean
  collapsedByDefault?: boolean
  children: React.ReactNode
}

const COLUMNS = 2
const ROW_GAP = 8

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}

export function TuneGroupGrid({
  title,
  subtitle,
  collapsible = false,
  collapsedByDefault = true,
  children,
}: TuneGroupGridProps) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault)
  const cells = Children.toArray(children)
  const rows = chunk(cells, COLUMNS)

  const header = (
    <View style={styles.groupHeader}>
      <Text style={styles.groupTitle}>{title}</Text>
      {collapsible ? (
        <CaretDownIcon
          size={14}
          color={theme.palette.slate.textMuted}
          weight="bold"
          style={{ transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }}
        />
      ) : subtitle ? (
        <Text style={styles.groupCount}>{subtitle}</Text>
      ) : null}
    </View>
  )

  if (collapsible) {
    return (
      <View style={styles.group}>
        <Pressable style={styles.groupHeaderPress} onPress={() => setCollapsed((value) => !value)}>
          {header}
        </Pressable>
        {!collapsed ? (
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((cell, cellIndex) => (
                  <View key={cellIndex} style={styles.cellSlot}>
                    {cell}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View style={styles.group}>
      {header}
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((cell, cellIndex) => (
              <View key={cellIndex} style={styles.cellSlot}>
                {cell}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  groupHeaderPress: {},
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  groupTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: {
    color: theme.palette.slate.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    gap: ROW_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: ROW_GAP,
  },
  cellSlot: {
    flex: 1,
    minWidth: 0,
  },
})

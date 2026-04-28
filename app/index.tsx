import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import PagerView from 'react-native-pager-view'

import { useBoardStore } from '@/src/store/boardStore'
import { HistoryScreen } from '@/src/screens/HistoryScreen'
import { CenterScreen } from '@/src/screens/CenterScreen'
import { MapScreen } from '@/src/screens/MapScreen'

const TABS = ['History', 'Board', 'Map'] as const

export default function MainScreen() {
  const [page, setPage] = useState(1)
  const pagerRef = useRef<PagerView>(null)
  const load = useBoardStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={1}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        <HistoryScreen key="history" />
        <CenterScreen key="center" />
        <MapScreen key="map" />
      </PagerView>

      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        {TABS.map((label, i) => (
          <TouchableOpacity
            key={label}
            style={styles.tab}
            onPress={() => pagerRef.current?.setPage(i)}
          >
            <Text style={[styles.tabText, page === i && styles.tabTextActive]}>{label}</Text>
            {page === i && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </SafeAreaView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  pager: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tabText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f9fafb',
  },
  tabIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
})

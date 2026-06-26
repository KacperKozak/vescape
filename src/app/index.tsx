import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useBleAppLifecycle } from '@/hooks/useBleAppLifecycle'
import { useBoardConnection } from '@/hooks/useBoardConnection'
import { CenterScreen } from '@/screens/CenterScreen'
import { theme } from '@/constants/theme'

export default function MainScreen() {
  const load = useBoardStore((s) => s.load)
  const boardsLoaded = useBoardStore((s) => s.hasLoaded)
  const startGpsTracking = useBleStore((s) => s.startGpsTracking)
  const { status: permStatus, request } = usePermissions()

  const connection = useBoardConnection()

  useBleAppLifecycle()

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (permStatus === 'granted') {
      startGpsTracking()
    }
  }, [permStatus, startGpsTracking])

  return (
    <View style={styles.container}>
      <CenterScreen
        activeBoard={connection.activeBoard}
        activeBoardId={connection.activeBoardId}
        boards={connection.boards}
        boardsLoaded={boardsLoaded}
        bleStatus={connection.bleStatus}
        onStopScan={connection.handleCancel}
        onRetryConnect={connection.handleRetryConnect}
        onSelectBoard={connection.handleSelectBoard}
        onAddBoard={connection.handleAddBoard}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
})

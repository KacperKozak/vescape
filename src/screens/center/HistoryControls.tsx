import { StyleSheet, View } from 'react-native'
import { ArrowLeftIcon, TrashIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '@/components/ui/base/IconButton'
import { ScreenTitle } from '@/components/ui/base/ScreenTitle'

interface HistoryControlsProps {
  loading: boolean
  canRemove: boolean
  onBack: () => void
  onRemove: () => void
}

export function HistoryControls({ loading, canRemove, onBack, onRemove }: HistoryControlsProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <IconButton icon={ArrowLeftIcon} onPress={onBack} />
        <View style={styles.titleWrap}>
          <ScreenTitle title="History" />
        </View>
        <IconButton
          icon={TrashIcon}
          onPress={onRemove}
          destructive
          disabled={!canRemove || loading}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    zIndex: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
})

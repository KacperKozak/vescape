import { StyleSheet, View } from 'react-native'
import {
  ArrowLeftIcon,
  ClockCounterClockwiseIcon,
  StarIcon,
  TrashIcon,
} from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '@/components/base/IconButton'
import { PillSelector, PillSelectorItem } from '@/components/controls/PillSelector'
import { theme } from '@/constants/theme'
import type { HistoryTab } from '@/screens/main/mainScreenStore'

interface HistoryControlsProps {
  loading: boolean
  tab: HistoryTab
  canRemove: boolean
  /** Star is offered only for an open ride; filled once that ride is already favorited. */
  canFavorite: boolean
  favorited: boolean
  onSelectTab: (tab: HistoryTab) => void
  onBack: () => void
  onRemove: () => void
  onToggleFavorite: () => void
}

export function HistoryControls({
  loading,
  tab,
  canRemove,
  canFavorite,
  favorited,
  onSelectTab,
  onBack,
  onRemove,
  onToggleFavorite,
}: HistoryControlsProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <IconButton icon={ArrowLeftIcon} onPress={onBack} />
        <View style={styles.tabsWrap}>
          <PillSelector activeId={tab} fitContent>
            <PillSelectorItem
              id="history"
              label="History"
              icon={ClockCounterClockwiseIcon}
              color={theme.palette.sky}
              testID="history-tab-history"
              onPress={() => onSelectTab('history')}
            />
            <PillSelectorItem
              id="favorites"
              label="Favorites"
              icon={StarIcon}
              color={theme.palette.amber}
              testID="history-tab-favorites"
              onPress={() => onSelectTab('favorites')}
            />
          </PillSelector>
        </View>
        {canFavorite ? (
          <IconButton
            icon={StarIcon}
            onPress={onToggleFavorite}
            disabled={loading}
            testID="history-favorite-ride"
            accent={favorited ? theme.palette.amber.color : undefined}
          />
        ) : null}
        {canRemove ? (
          <IconButton icon={TrashIcon} onPress={onRemove} destructive disabled={loading} />
        ) : (
          <View style={styles.actionSpacer} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actionSpacer: {
    width: 38,
    height: 38,
  },
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
    gap: 8,
  },
  tabsWrap: {
    flex: 1,
    alignItems: 'center',
  },
})

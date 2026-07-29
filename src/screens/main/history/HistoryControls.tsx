import { StyleSheet, View } from 'react-native'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  PencilSimpleIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '@/components/base/IconButton'
import { Text } from '@/components/base/Text'
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
  /** Trim mode swaps tabs/star/trash for a cancel/save pair over the range being pinned. */
  trimming: boolean
  /**
   * Favorite detail mode: the tabs and the star give way to the Favorite's own title plus rename
   * and delete. Back returns to the Favorites list rather than leaving history.
   */
  favorite?: {
    title: string
    onRename: () => void
    onDelete: () => void
  }
  saving: boolean
  onSelectTab: (tab: HistoryTab) => void
  onBack: () => void
  onRemove: () => void
  onToggleFavorite: () => void
  onCancelTrim: () => void
  onSaveTrim: () => void
}

export function HistoryControls({
  loading,
  tab,
  canRemove,
  canFavorite,
  favorited,
  trimming,
  favorite,
  saving,
  onSelectTab,
  onBack,
  onRemove,
  onToggleFavorite,
  onCancelTrim,
  onSaveTrim,
}: HistoryControlsProps) {
  const insets = useSafeAreaInsets()

  if (trimming) {
    return (
      <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
        <View style={styles.row}>
          <IconButton icon={XIcon} onPress={onCancelTrim} disabled={saving} testID="trim-cancel" />
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Trim favorite
            </Text>
          </View>
          <IconButton
            icon={CheckIcon}
            onPress={onSaveTrim}
            loading={saving}
            testID="trim-save"
            accent={theme.palette.amber.color}
          />
        </View>
      </View>
    )
  }

  if (favorite) {
    return (
      <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
        <View style={styles.row}>
          <IconButton icon={ArrowLeftIcon} onPress={onBack} testID="favorite-detail-back" />
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {favorite.title}
            </Text>
          </View>
          <IconButton
            icon={PencilSimpleIcon}
            onPress={favorite.onRename}
            disabled={loading}
            testID="favorite-rename"
          />
          <IconButton
            icon={TrashIcon}
            onPress={favorite.onDelete}
            destructive
            disabled={loading}
            testID="favorite-delete"
          />
        </View>
      </View>
    )
  }

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
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
})

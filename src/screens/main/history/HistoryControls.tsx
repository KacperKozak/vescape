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
   * Favorite tab actions. Selection stays in the shared history panel below.
   */
  favorite?: {
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

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <IconButton icon={ArrowLeftIcon} onPress={onBack} />
        <View style={styles.tabsWrap} pointerEvents="box-none">
          <PillSelector
            activeId={tab}
            contained
            fitContent
            style={styles.tabs}
            contentContainerStyle={styles.tabsContent}
          >
            <PillSelectorItem
              id="history"
              label="History"
              icon={ClockCounterClockwiseIcon}
              activeLabelOnly
              activeWidth={116}
              inactiveWidth={46}
              color={theme.palette.sky}
              testID="history-tab-history"
              onPress={() => onSelectTab('history')}
            />
            <PillSelectorItem
              id="favorites"
              label="Favorites"
              icon={StarIcon}
              activeLabelOnly
              activeWidth={126}
              inactiveWidth={46}
              color={theme.palette.amber}
              testID="history-tab-favorites"
              onPress={() => onSelectTab('favorites')}
            />
          </PillSelector>
        </View>
        <View style={styles.actions}>
          {favorite ? (
            <>
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
            </>
          ) : canFavorite ? (
            <IconButton
              icon={StarIcon}
              onPress={onToggleFavorite}
              disabled={loading}
              testID="history-favorite-ride"
              accent={favorited ? theme.palette.amber.color : undefined}
            />
          ) : null}
          {!favorite && canRemove ? (
            <IconButton icon={TrashIcon} onPress={onRemove} destructive disabled={loading} />
          ) : !favorite ? (
            <View style={styles.actionSpacer} />
          ) : null}
        </View>
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
    justifyContent: 'space-between',
    gap: 8,
  },
  tabsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  tabs: {
    alignSelf: 'center',
  },
  tabsContent: {
    justifyContent: 'center',
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

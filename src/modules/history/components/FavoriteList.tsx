import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { StarIcon, TrashIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '@/components/base/IconButton'
import { Placeholder } from '@/components/base/Placeholder'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { telemetry } from '@/modules/board/constants/telemetry'
import { formatRideDate, formatRideTime } from '@/modules/history/lib/rideFormat'
import type { Favorite } from '@/modules/history/store/favoriteStore'

interface FavoriteListProps {
  favorites: Favorite[]
  loading: boolean
  onRemove: (favorite: Favorite) => void
}

/** Favorites tab: the starred ranges, newest first. Unnamed rows fall back to date, like history. */
export function FavoriteList({ favorites, loading, onRemove }: FavoriteListProps) {
  const insets = useSafeAreaInsets()

  if (loading && favorites.length === 0) {
    return (
      <View style={styles.wrap} pointerEvents="none">
        <ActivityIndicator size="small" color={theme.palette.sky.color} />
      </View>
    )
  }

  if (favorites.length === 0) {
    return (
      <View style={styles.wrap} pointerEvents="none">
        <Placeholder
          icon={StarIcon}
          title="No favorites yet"
          description="Star a ride in History to keep it here"
        />
      </View>
    )
  }

  return (
    <ScrollView
      testID="favorites-list"
      style={[styles.listWrap, { paddingTop: Math.max(insets.top, 8) + 56 }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
    >
      {favorites.map((favorite) => (
        <View key={favorite.id} testID={`favorite-row-${favorite.id}`} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {favorite.name ?? formatRideDate(favorite.startMs, favorite.endMs)}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {formatRideTime(favorite.startMs, favorite.endMs)}
              {favorite.boardName ? ` · ${favorite.boardName}` : ''}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {formatDuration(favorite.movingDurationMs)} · {formatDistance(favorite.distanceM)} ·{' '}
              {telemetry.speed.formatWithUnit(favorite.maxSpeedKmh)} ·{' '}
              {favorite.batteryUsedWh.toFixed(1)} Wh
            </Text>
          </View>
          <IconButton
            icon={TrashIcon}
            destructive
            testID={`favorite-remove-${favorite.id}`}
            onPress={() => onRemove(favorite)}
          />
        </View>
      ))}
    </ScrollView>
  )
}

function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

function formatDistance(distanceM: number | null): string {
  if (distanceM == null) return '-'
  return `${(distanceM / 1000).toFixed(2)} km`
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listWrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 12,
  },
  content: {
    width: '100%',
    paddingHorizontal: 16,
    gap: 8,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
  },
  rowMeta: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
  },
})

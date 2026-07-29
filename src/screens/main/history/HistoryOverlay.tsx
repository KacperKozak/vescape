import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Favorite, HistoryGpsSample, HistoryMarker } from 'vescape-core'

import { Text } from '@/components/base/Text'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { theme } from '@/constants/theme'
import { FavoriteList } from '@/modules/history/components/FavoriteList'
import { HistoryEmptyState } from '@/modules/history/components/HistoryEmptyState'
import { HistorySessionSheet } from '@/modules/history/components/HistorySessionSheet'
import { MediaHistoryViewer } from '@/modules/history/components/MediaHistoryViewer'
import type { MediaAssetInput, MediaHistoryAsset } from '@/modules/history/lib/mediaHistory'
import { sessionContainsFavorite } from '@/modules/history/lib/favorites'
import type { HistoryMetricKey } from '@/modules/history/lib/metricColorScale'
import type {
  HistorySession,
  TelemetryMinuteBucket,
  TelemetrySample,
} from '@/modules/history/store/historyStore'
import { HistoryControls } from '@/screens/main/history/HistoryControls'
import { HistoryMapLoading } from '@/screens/main/history/HistoryMapLoading'
import { HistoryRideDetail } from '@/screens/main/history/HistoryRideDetail'
import type { HistoryTab } from '@/screens/main/mainScreenStore'
import { STRIP_CONTENT_HEIGHT } from '@/screens/main/overlays/BottomTelemetryStrip'

export interface MainHistoryOverlayProps {
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
  sessionGpsSamples: HistoryGpsSample[]
  sessionMarkers: HistoryMarker[]
  nextRide: HistorySession | null
  canPreviousRide: boolean
  loadingSession: boolean
  historyLoading: boolean
  historyHasMore: boolean
  historyError: string | undefined
  blocks: TelemetryMinuteBucket[]
  sessions: HistorySession[]
  historySheetVisible: boolean
  setHistorySheetVisible: (visible: boolean) => void
  historyTab: HistoryTab
  selectHistoryTab: (tab: HistoryTab) => void
  favorites: Favorite[]
  favoritesLoading: boolean
  favoritesSaving: boolean
  favoritesError: string | undefined
  selectedSessionFavorite: Favorite | null
  trimming: boolean
  trimSeed: { startMs: number; endMs: number } | null
  beginTrimFavorite: () => void
  updateTrimRange: (startMs: number, endMs: number) => void
  cancelTrim: () => void
  saveTrim: () => Promise<void>
  removeFavorite: (id: string) => Promise<void>
  /** The Favorite whose detail is open, or null while the Favorites list is showing. */
  openFavorite: Favorite | null
  showFavorite: (favorite: Favorite) => Promise<void>
  hideFavorite: () => Promise<void>
  renameOpenFavorite: (name: string | null) => Promise<void>
  removeOpenFavorite: () => Promise<void>
  selectSession: (session: HistorySession | null) => Promise<void>
  loadMoreHistory: () => Promise<void>
  selectPreviousRide: () => Promise<void>
  selectNextRide: () => Promise<void>
  selectRide: (session: HistorySession) => void
  exitHistory: () => void
  removeSession: () => void
  onSeek: (timeMs: number) => void
  setActiveHistoryMapMetric: (metric: HistoryMetricKey) => void
  mediaHistory: {
    assets: MediaHistoryAsset[]
    unmatched: MediaAssetInput[]
    loading: boolean
    error: string | null
    add: () => Promise<void>
  }
  openMedia: (asset: MediaAssetInput) => void
  openMediaAssetId: string | null
  closeMedia: () => void
}

interface HistoryOverlayProps {
  visible: boolean
  history: MainHistoryOverlayProps
  /** Height of the telemetry panel, so the session sheet and the map vignette sit above it. */
  panelHeight: number
  onPanelHeightChange: (height: number) => void
}

/** History mode: the replayed ride's panel, stats and controls, plus the ride list and media. */
export function HistoryOverlay({
  visible,
  history,
  panelHeight,
  onPanelHeightChange,
}: HistoryOverlayProps) {
  const insets = useSafeAreaInsets()
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const busy =
    history.loadingSession ||
    history.historyLoading ||
    history.favoritesLoading ||
    history.favoritesSaving
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom * 0.5, 8) + 8
  const sheetBottom = Math.max(insets.bottom, 16) + 8 + panelHeight + 8
  // Favorite detail is the history detail fed a favorite-backed session: same panel, map and stats,
  // only the header actions differ.
  const favoriteMode = history.historyTab === 'favorites' && history.openFavorite != null
  const detailSession =
    history.historyTab === 'history' || favoriteMode ? history.selectedSession : null
  const selectedSessionContainsFavorite =
    history.selectedSession != null &&
    sessionContainsFavorite(history.favorites, history.selectedSession)

  const handleRemoveConfirm = useCallback(() => {
    setRemoveConfirmVisible(false)
    history.removeSession()
  }, [history])

  return (
    <>
      {visible && history.historyTab === 'favorites' && !history.openFavorite && (
        <>
          <FavoriteList
            favorites={history.favorites}
            loading={history.favoritesLoading}
            onOpen={(favorite) => {
              void history.showFavorite(favorite)
            }}
            onRemove={(favorite) => {
              void history.removeFavorite(favorite.id)
            }}
          />
          <HistoryControls
            loading={busy}
            tab={history.historyTab}
            canRemove={false}
            canFavorite={false}
            favorited={false}
            trimming={false}
            saving={false}
            onSelectTab={history.selectHistoryTab}
            onBack={history.exitHistory}
            onRemove={() => undefined}
            onToggleFavorite={() => undefined}
            onCancelTrim={() => undefined}
            onSaveTrim={() => undefined}
          />
        </>
      )}

      {visible && detailSession && (
        <HistoryRideDetail
          history={history}
          session={detailSession}
          favoriteMode={favoriteMode}
          busy={busy}
          onRemoveSession={() => setRemoveConfirmVisible(true)}
          onPanelHeightChange={onPanelHeightChange}
        />
      )}

      {visible && history.historyTab === 'history' && !history.selectedSession && (
        <>
          {busy ? <HistoryMapLoading /> : <HistoryEmptyState />}
          <HistoryControls
            loading={busy}
            tab={history.historyTab}
            canRemove={false}
            canFavorite={false}
            favorited={false}
            trimming={false}
            saving={false}
            onSelectTab={history.selectHistoryTab}
            onBack={history.exitHistory}
            onRemove={() => undefined}
            onToggleFavorite={() => undefined}
            onCancelTrim={() => undefined}
            onSaveTrim={() => undefined}
          />
        </>
      )}

      <HistorySessionSheet
        visible={history.historySheetVisible}
        bottomOffset={sheetBottom}
        blocks={history.blocks}
        sessions={history.sessions}
        favorites={history.favorites}
        selectedSessionId={history.selectedSession?.id ?? null}
        hasMore={history.historyHasMore}
        loadingMore={history.historyLoading}
        onClose={() => history.setHistorySheetVisible(false)}
        onSelectSession={(session) => {
          history.setHistorySheetVisible(false)
          history.selectRide(session)
        }}
        onLoadMore={() => {
          void history.loadMoreHistory()
        }}
      />

      {visible && (history.historyError ?? history.favoritesError) ? (
        <View style={[styles.historyError, { bottom: aboveStripBottom }]}>
          <Text style={styles.historyErrorText} selectable>
            {history.historyError ?? history.favoritesError}
          </Text>
        </View>
      ) : null}

      {history.openMediaAssetId ? (
        <MediaHistoryViewer
          key={history.openMediaAssetId}
          assets={[...history.mediaHistory.assets, ...history.mediaHistory.unmatched]}
          initialAssetId={history.openMediaAssetId}
          samples={history.sessionSamples}
          markers={history.sessionMarkers}
          onClose={history.closeMedia}
        />
      ) : null}

      <ConfirmModal
        visible={removeConfirmVisible}
        title="Delete Ride"
        message={
          selectedSessionContainsFavorite
            ? 'Favorited telemetry will be kept. The rest of this ride will be permanently removed.'
            : 'This ride and all its telemetry data will be permanently removed.'
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveConfirmVisible(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  historyError: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 25,
    borderRadius: 10,
    padding: 10,
    backgroundColor: theme.status.error.bg,
    borderWidth: 1,
    borderColor: theme.status.error.bg,
  },
  historyErrorText: {
    color: theme.status.error.text,
    fontSize: 12,
    fontWeight: '700',
  },
})

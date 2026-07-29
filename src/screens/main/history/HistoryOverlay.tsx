import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
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
import type { HistoryMetricKey } from '@/modules/history/lib/metricColorScale'
import type {
  HistorySession,
  TelemetryMinuteBucket,
  TelemetrySample,
} from '@/modules/history/store/historyStore'
import { HistoryControls } from '@/screens/main/history/HistoryControls'
import { HistoryStatsBar } from '@/screens/main/history/HistoryStatsBar'
import { HistoryTelemetryPanel } from '@/screens/main/history/HistoryTelemetryPanel'
import { TrimStatsBar } from '@/screens/main/history/TrimStatsBar'
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

  const handleRemoveConfirm = useCallback(() => {
    setRemoveConfirmVisible(false)
    history.removeSession()
  }, [history])

  return (
    <>
      {visible && history.historyTab === 'favorites' && (
        <>
          <FavoriteList
            favorites={history.favorites}
            loading={history.favoritesLoading}
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

      {visible && history.historyTab === 'history' && history.selectedSession && (
        <>
          {busy && (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator size="small" color={theme.palette.sky.color} />
            </View>
          )}
          <HistoryTelemetryPanel
            startAtMs={history.selectedSession.startAtMs}
            endAtMs={history.selectedSession.endAtMs}
            movingStartAtMs={history.selectedSession.movingStartAtMs}
            movingEndAtMs={history.selectedSession.movingEndAtMs}
            deviceName={history.selectedSession.deviceName}
            samples={history.sessionSamples}
            canPrevious={!history.trimming && history.canPreviousRide}
            canNext={!history.trimming && !!history.nextRide}
            mediaAssets={history.mediaHistory.assets}
            mediaUnmatched={history.mediaHistory.unmatched}
            mediaLoading={history.mediaHistory.loading}
            mediaError={history.mediaHistory.error}
            onPrevious={() => {
              void history.selectPreviousRide()
            }}
            onNext={() => {
              void history.selectNextRide()
            }}
            onOpenList={() => history.setHistorySheetVisible(true)}
            onAddMedia={() => void history.mediaHistory.add()}
            onOpenMedia={history.openMedia}
            onSeek={history.onSeek}
            onMetricInteraction={history.setActiveHistoryMapMetric}
            onHeightChange={onPanelHeightChange}
            trim={
              history.trimming && history.trimSeed
                ? {
                    startMs: history.trimSeed.startMs,
                    endMs: history.trimSeed.endMs,
                    onChange: history.updateTrimRange,
                    onCommit: history.updateTrimRange,
                  }
                : undefined
            }
          />
          {history.trimming ? (
            <TrimStatsBar
              session={history.selectedSession}
              samples={history.sessionSamples}
              gpsSamples={history.sessionGpsSamples}
            />
          ) : (
            <HistoryStatsBar session={history.selectedSession} />
          )}
          <HistoryControls
            loading={busy}
            tab={history.historyTab}
            canRemove={true}
            canFavorite={true}
            favorited={history.selectedSessionFavorite != null}
            trimming={history.trimming}
            saving={history.favoritesSaving}
            onSelectTab={history.selectHistoryTab}
            onBack={history.exitHistory}
            onRemove={() => setRemoveConfirmVisible(true)}
            onToggleFavorite={history.beginTrimFavorite}
            onCancelTrim={history.cancelTrim}
            onSaveTrim={() => {
              void history.saveTrim()
            }}
          />
        </>
      )}

      {visible && history.historyTab === 'history' && !history.selectedSession && (
        <>
          {busy ? (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator size="small" color={theme.palette.sky.color} />
            </View>
          ) : (
            <HistoryEmptyState />
          )}
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
        message="This ride and all its telemetry data will be permanently removed."
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
  mapLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.6),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    transform: [{ translateX: -17 }, { translateY: -17 }],
  },
})

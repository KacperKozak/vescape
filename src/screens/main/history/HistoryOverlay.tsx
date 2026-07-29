import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { HistoryMarker } from 'vescape-core'

import { Text } from '@/components/base/Text'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { theme } from '@/constants/theme'
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
import { STRIP_CONTENT_HEIGHT } from '@/screens/main/overlays/BottomTelemetryStrip'

export interface MainHistoryOverlayProps {
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
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
  const busy = history.loadingSession || history.historyLoading
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom * 0.5, 8) + 8
  const sheetBottom = Math.max(insets.bottom, 16) + 8 + panelHeight + 8

  const handleRemoveConfirm = useCallback(() => {
    setRemoveConfirmVisible(false)
    history.removeSession()
  }, [history])

  return (
    <>
      {visible && history.selectedSession && (
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
            canPrevious={history.canPreviousRide}
            canNext={!!history.nextRide}
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
          />
          <HistoryStatsBar session={history.selectedSession} />
          <HistoryControls
            loading={busy}
            canRemove={true}
            onBack={history.exitHistory}
            onRemove={() => setRemoveConfirmVisible(true)}
          />
        </>
      )}

      {visible && !history.selectedSession && (
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
            canRemove={false}
            onBack={history.exitHistory}
            onRemove={() => undefined}
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

      {visible && history.historyError ? (
        <View style={[styles.historyError, { bottom: aboveStripBottom }]}>
          <Text style={styles.historyErrorText} selectable>
            {history.historyError}
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

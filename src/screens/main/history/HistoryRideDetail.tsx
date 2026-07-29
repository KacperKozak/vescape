import { useState } from 'react'

import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { TextPromptModal } from '@/components/modals/TextPromptModal'
import { formatRideDate } from '@/modules/history/lib/rideFormat'
import type { HistorySession } from '@/modules/history/store/historyStore'
import { HistoryControls } from '@/screens/main/history/HistoryControls'
import { HistoryMapLoading } from '@/screens/main/history/HistoryMapLoading'
import { HistoryStatsBar } from '@/screens/main/history/HistoryStatsBar'
import { HistoryTelemetryPanel } from '@/screens/main/history/HistoryTelemetryPanel'
import { TrimStatsBar } from '@/screens/main/history/TrimStatsBar'
import type { MainHistoryOverlayProps } from '@/screens/main/history/HistoryOverlay'

interface HistoryRideDetailProps {
  history: MainHistoryOverlayProps
  /** The ride being replayed: a grouped history session, or a favorite-backed one. */
  session: HistorySession
  /**
   * Favorite detail rather than a history ride: the header carries the Favorite's name, rename and
   * delete, and the ride-only affordances (prev/next, star, trim, ride delete) are gone.
   */
  favoriteMode: boolean
  busy: boolean
  onRemoveSession: () => void
  onPanelHeightChange: (height: number) => void
}

/** The replayed ride: chart panel, stats and header. Shared by history mode and favorite mode. */
export function HistoryRideDetail({
  history,
  session,
  favoriteMode,
  busy,
  onRemoveSession,
  onPanelHeightChange,
}: HistoryRideDetailProps) {
  const [renameVisible, setRenameVisible] = useState(false)
  const [deleteVisible, setDeleteVisible] = useState(false)
  const openFavorite = favoriteMode ? history.openFavorite : null
  const trimming = !favoriteMode && history.trimming

  return (
    <>
      {busy && <HistoryMapLoading />}
      <HistoryTelemetryPanel
        startAtMs={session.startAtMs}
        endAtMs={session.endAtMs}
        movingStartAtMs={session.movingStartAtMs}
        movingEndAtMs={session.movingEndAtMs}
        deviceName={session.deviceName}
        samples={history.sessionSamples}
        canPrevious={!favoriteMode && !trimming && history.canPreviousRide}
        canNext={!favoriteMode && !trimming && !!history.nextRide}
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
        onOpenList={() => {
          if (favoriteMode) void history.hideFavorite()
          else history.setHistorySheetVisible(true)
        }}
        onAddMedia={() => void history.mediaHistory.add()}
        onOpenMedia={history.openMedia}
        onSeek={history.onSeek}
        onMetricInteraction={history.setActiveHistoryMapMetric}
        onHeightChange={onPanelHeightChange}
        trim={
          trimming && history.trimSeed
            ? {
                startMs: history.trimSeed.startMs,
                endMs: history.trimSeed.endMs,
                onChange: history.updateTrimRange,
                onCommit: history.updateTrimRange,
              }
            : undefined
        }
      />
      {trimming ? (
        <TrimStatsBar
          session={session}
          samples={history.sessionSamples}
          gpsSamples={history.sessionGpsSamples}
        />
      ) : (
        <HistoryStatsBar session={session} />
      )}
      <HistoryControls
        loading={busy}
        tab={history.historyTab}
        canRemove={!favoriteMode}
        canFavorite={!favoriteMode}
        favorited={history.selectedSessionFavorite != null}
        trimming={trimming}
        saving={history.favoritesSaving}
        favorite={
          openFavorite
            ? {
                title:
                  openFavorite.name ?? formatRideDate(openFavorite.startMs, openFavorite.endMs),
                onRename: () => setRenameVisible(true),
                onDelete: () => setDeleteVisible(true),
              }
            : undefined
        }
        onSelectTab={history.selectHistoryTab}
        onBack={
          favoriteMode
            ? () => {
                void history.hideFavorite()
              }
            : history.exitHistory
        }
        onRemove={onRemoveSession}
        onToggleFavorite={history.beginTrimFavorite}
        onCancelTrim={history.cancelTrim}
        onSaveTrim={() => {
          void history.saveTrim()
        }}
      />

      <TextPromptModal
        visible={renameVisible}
        title="Rename Favorite"
        placeholder="Dolina single track"
        initialValue={openFavorite?.name ?? ''}
        confirmLabel="Save"
        allowEmpty
        onConfirm={(value) => {
          setRenameVisible(false)
          void history.renameOpenFavorite(value.length > 0 ? value : null)
        }}
        onDismiss={() => setRenameVisible(false)}
      />

      <ConfirmModal
        visible={deleteVisible}
        title="Delete Favorite"
        message="The Favorite is removed. Its telemetry stays in history and becomes deletable again."
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          setDeleteVisible(false)
          void history.removeOpenFavorite()
        }}
        onCancel={() => setDeleteVisible(false)}
      />
    </>
  )
}

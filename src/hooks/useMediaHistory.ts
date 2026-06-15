import { useCallback, useEffect, useState } from 'react'
import * as MediaLibrary from 'expo-media-library'
import * as LegacyMediaLibrary from 'expo-media-library/legacy'

import {
  matchMediaHistoryAssetsWithDiagnostics,
  type MediaAssetInput,
  type MediaHistoryAsset,
  type MediaHistoryMatchDiagnostics,
} from '@/lib/history/mediaHistory'
import type { HistoryGpsSample, HistoryMarker, HistorySession } from '@/store/historyStore'

type MediaPermissionState = 'unknown' | 'full' | 'limited' | 'denied'
const EMPTY_DIAGNOSTICS: MediaHistoryMatchDiagnostics = {
  queried: 0,
  matched: 0,
  outsideRide: 0,
  noRecordingGps: 0,
  outsideTolerance: 0,
  outsideGpsSpan: 0,
}

async function queryRideAssets(startAtMs: number, endAtMs: number): Promise<MediaAssetInput[]> {
  const assets: MediaAssetInput[] = []
  let after: string | undefined
  do {
    const page = await LegacyMediaLibrary.getAssetsAsync({
      first: 200,
      after,
      createdAfter: startAtMs - 1,
      createdBefore: endAtMs + 1,
      mediaType: ['photo', 'video'],
      sortBy: [['creationTime', true]],
    })
    assets.push(
      ...page.assets.flatMap((asset) =>
        asset.mediaType === 'photo' || asset.mediaType === 'video'
          ? [
              {
                id: asset.id,
                uri: asset.uri,
                filename: asset.filename,
                mediaType: asset.mediaType,
                creationTime: asset.creationTime,
                duration: asset.duration,
                width: asset.width,
                height: asset.height,
              },
            ]
          : [],
      ),
    )
    after = page.hasNextPage ? page.endCursor : undefined
  } while (after)
  return assets
}

export function useMediaHistory({
  selectedSession,
  gpsSamples,
  markers,
}: {
  selectedSession: HistorySession | null
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
}) {
  const [enabled, setEnabled] = useState(false)
  const [permission, setPermission] = useState<MediaPermissionState>('unknown')
  const [assets, setAssets] = useState<MediaHistoryAsset[]>([])
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<MediaHistoryMatchDiagnostics>(EMPTY_DIAGNOSTICS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)

  const refresh = useCallback(() => setRefreshRevision((revision) => revision + 1), [])

  const toggle = useCallback(() => {
    setEnabled((current) => {
      if (!current) setLoading(true)
      return !current
    })
  }, [])

  const manageLimitedAccess = useCallback(async () => {
    await MediaLibrary.presentPermissionsPicker(['photo', 'video'])
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled) return
    const subscription = MediaLibrary.addListener(refresh)
    return () => subscription.remove()
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || !selectedSession) {
      return
    }

    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const existing = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video'])
      const response = existing.granted
        ? existing
        : await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video'])
      if (cancelled) return
      const accessPrivileges = (
        response as typeof response & { accessPrivileges?: 'all' | 'limited' | 'none' }
      ).accessPrivileges
      if (!response.granted) {
        setPermission('denied')
        setAssets([])
        setDiagnostics(EMPTY_DIAGNOSTICS)
        return
      }
      setPermission(accessPrivileges === 'limited' ? 'limited' : 'full')
      const queried = await queryRideAssets(selectedSession.startAtMs, selectedSession.endAtMs)
      if (cancelled) return
      const result = matchMediaHistoryAssetsWithDiagnostics({
        assets: queried,
        gpsSamples,
        markers,
        startAtMs: selectedSession.startAtMs,
        endAtMs: selectedSession.endAtMs,
      })
      setAssets(result.assets)
      setDiagnostics(result.diagnostics)
      setLoadedSessionId(selectedSession.id)
    })()
      .catch((cause: unknown) => {
        if (cancelled) return
        setAssets([])
        setDiagnostics(EMPTY_DIAGNOSTICS)
        setError(cause instanceof Error ? cause.message : 'Could not read local media')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, gpsSamples, markers, refreshRevision, selectedSession])

  return {
    enabled,
    permission,
    assets: enabled && loadedSessionId === selectedSession?.id ? assets : [],
    mediaCount: loadedSessionId === selectedSession?.id ? assets.length : 0,
    diagnostics:
      enabled && loadedSessionId === selectedSession?.id ? diagnostics : EMPTY_DIAGNOSTICS,
    loading: enabled && !!selectedSession && loading,
    error: enabled ? error : null,
    toggle,
    refresh,
    manageLimitedAccess,
  }
}

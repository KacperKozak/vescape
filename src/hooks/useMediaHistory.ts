import { useCallback, useEffect, useMemo, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'

import {
  matchMediaHistoryAssets,
  resolvePickedAssetCreationTime,
  type MediaAssetInput,
} from '@/lib/history/mediaHistory'
import type { HistoryGpsSample, HistoryMarker, HistorySession } from '@/store/historyStore'
import { listRideMediaAssets, saveRideMediaAssets } from '@/store/rideMediaFiles'

// Google Play's Photo and Video Permissions policy forbids READ_MEDIA_IMAGES/READ_MEDIA_VIDEO
// for this feature, so ride media comes from the permissionless system photo picker: the user
// picks assets, we copy them into the ride's media folder, and place the ones with a
// recoverable creation time on the ride.
async function pickRideAssets(): Promise<MediaAssetInput[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    exif: true,
    quality: 1,
  })
  if (result.canceled) return []
  return result.assets.map((asset) => ({
    id: asset.assetId ?? asset.uri,
    uri: asset.uri,
    filename: asset.fileName ?? '',
    mediaType: asset.type === 'video' ? 'video' : 'photo',
    creationTime:
      resolvePickedAssetCreationTime({
        exif: asset.exif,
        filename: asset.fileName ?? '',
      }) ?? Number.NaN,
  }))
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
  const [stored, setStored] = useState<MediaAssetInput[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setError(null)
      if (!selectedSession) {
        setStored([])
        return
      }
      try {
        setStored(listRideMediaAssets(selectedSession.id))
      } catch (cause: unknown) {
        setStored([])
        setError(cause instanceof Error ? cause.message : 'Could not read ride media')
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedSession])

  const add = useCallback(async () => {
    if (!selectedSession) return
    setLoading(true)
    setError(null)
    try {
      const picked = await pickRideAssets()
      if (picked.length === 0) return
      await saveRideMediaAssets(selectedSession.id, picked)
      setStored(listRideMediaAssets(selectedSession.id))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not save picked media')
    } finally {
      setLoading(false)
    }
  }, [selectedSession])

  const { assets, unmatched } = useMemo(() => {
    if (!selectedSession || stored.length === 0) {
      return { assets: [], unmatched: [] }
    }
    const matched = matchMediaHistoryAssets({
      assets: stored,
      gpsSamples,
      markers,
      startAtMs: selectedSession.startAtMs,
      endAtMs: selectedSession.endAtMs,
    })
    const matchedIds = new Set(matched.map((asset) => asset.id))
    return {
      assets: matched,
      unmatched: stored.filter((asset) => !matchedIds.has(asset.id)),
    }
  }, [gpsSamples, markers, selectedSession, stored])

  return {
    assets,
    unmatched,
    loading,
    error,
    add,
  }
}

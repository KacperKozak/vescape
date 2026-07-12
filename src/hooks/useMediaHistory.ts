import { useCallback, useMemo, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'

import {
  matchMediaHistoryAssets,
  resolvePickedAssetCreationTime,
  type MediaAssetInput,
} from '@/lib/history/mediaHistory'
import type { HistoryGpsSample, HistoryMarker, HistorySession } from '@/store/historyStore'

// Google Play's Photo and Video Permissions policy forbids READ_MEDIA_IMAGES/READ_MEDIA_VIDEO
// for this feature, so ride media comes from the permissionless system photo picker: the user
// picks assets and we place the ones with a recoverable creation time on the ride.
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
    duration: (asset.duration ?? 0) / 1000,
    width: asset.width,
    height: asset.height,
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
  const [picked, setPicked] = useState<MediaAssetInput[]>([])
  const [pickedSessionId, setPickedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionPicked = pickedSessionId === selectedSession?.id ? picked : []

  const add = useCallback(async () => {
    if (!selectedSession) return
    setLoading(true)
    setError(null)
    try {
      const newAssets = await pickRideAssets()
      if (newAssets.length === 0) return
      setPicked((previous) => {
        const base = pickedSessionId === selectedSession.id ? previous : []
        const seen = new Set(base.map((asset) => asset.id))
        return [...base, ...newAssets.filter((asset) => !seen.has(asset.id))]
      })
      setPickedSessionId(selectedSession.id)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not read picked media')
    } finally {
      setLoading(false)
    }
  }, [pickedSessionId, selectedSession])

  const { assets, unmatched } = useMemo(() => {
    if (!selectedSession || sessionPicked.length === 0) {
      return { assets: [], unmatched: [] }
    }
    const matched = matchMediaHistoryAssets({
      assets: sessionPicked,
      gpsSamples,
      markers,
      startAtMs: selectedSession.startAtMs,
      endAtMs: selectedSession.endAtMs,
    })
    const matchedIds = new Set(matched.map((asset) => asset.id))
    return {
      assets: matched,
      unmatched: sessionPicked.filter((asset) => !matchedIds.has(asset.id)),
    }
  }, [gpsSamples, markers, selectedSession, sessionPicked])

  return {
    assets,
    unmatched,
    loading,
    error,
    add,
  }
}

import { Directory, File, Paths } from 'expo-file-system'

import {
  decodeRideMediaFilename,
  encodeRideMediaFilename,
  type MediaAssetInput,
} from '@/modules/history/lib/mediaHistory'

// Ride media storage: the filesystem is the only record. Each ride owns a folder of copied
// picker files whose names encode all asset metadata (see encodeRideMediaFilename).
function rideMediaDirectory(sessionId: string): Directory {
  return new Directory(Paths.document, 'rideMedia', sessionId)
}

export function listRideMediaAssets(sessionId: string): MediaAssetInput[] {
  const directory = rideMediaDirectory(sessionId)
  if (!directory.exists) return []
  return directory.list().flatMap((entry) => {
    if (!(entry instanceof File)) return []
    const decoded = decodeRideMediaFilename(entry.name)
    if (!decoded) return []
    return [
      {
        id: entry.uri,
        uri: entry.uri,
        filename: entry.name,
        mediaType: decoded.mediaType,
        creationTime: decoded.creationTime,
      },
    ]
  })
}

export async function saveRideMediaAssets(
  sessionId: string,
  assets: readonly MediaAssetInput[],
): Promise<void> {
  const directory = rideMediaDirectory(sessionId)
  directory.create({ intermediates: true, idempotent: true })
  for (const asset of assets) {
    const target = new File(directory, encodeRideMediaFilename(asset))
    if (target.exists) continue
    await new File(asset.uri).copy(target)
  }
}

export function deleteRideMediaAssets(sessionId: string): void {
  const directory = rideMediaDirectory(sessionId)
  if (directory.exists) directory.delete()
}

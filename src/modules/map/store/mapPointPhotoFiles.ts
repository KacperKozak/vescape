import { Directory, File, Paths } from 'expo-file-system'
import type { MapPointMediaAsset } from 'vescape-core'

export type PickedMapPointMediaAsset = {
  id: string
  uri: string
  filename: string
  mediaType: 'photo' | 'video'
}

function mapPointMediaDirectory(pointId: string): Directory {
  return new Directory(Paths.document, 'mapPointMedia', pointId)
}

function mediaExtension(uri: string, mediaType: PickedMapPointMediaAsset['mediaType']): string {
  return (
    /\.(\w+)(?:[?#].*)?$/.exec(uri)?.[1]?.toLowerCase() ?? (mediaType === 'video' ? 'mp4' : 'jpg')
  )
}

function safeFilename(index: number, asset: PickedMapPointMediaAsset): string {
  const extension = mediaExtension(asset.uri, asset.mediaType)
  return `${index + 1}_${asset.mediaType}_${asset.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-12) || 'asset'}.${extension}`
}

export async function saveMapPointMediaAssets(
  pointId: string,
  assets: readonly PickedMapPointMediaAsset[],
): Promise<MapPointMediaAsset[]> {
  const directory = mapPointMediaDirectory(pointId)
  directory.create({ intermediates: true, idempotent: true })
  const saved: MapPointMediaAsset[] = []
  for (const [index, asset] of assets.entries()) {
    const filename = safeFilename(index, asset)
    const target = new File(directory, filename)
    if (!target.exists) await new File(asset.uri).copy(target)
    saved.push({ ...asset, uri: target.uri, filename })
  }
  return saved
}

export function deleteMapPointMedia(pointId: string): void {
  const directory = mapPointMediaDirectory(pointId)
  if (directory.exists) directory.delete()
}

export function deleteMapPointMediaAsset(uri: string): void {
  const file = new File(uri)
  if (file.exists) file.delete()
}

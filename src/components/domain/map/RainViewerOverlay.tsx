import { RasterLayer, RasterSource } from '@rnmapbox/maps'
import { useEffect, useMemo } from 'react'

import { buildRainViewerTileTemplate, useRainViewerRadarStore } from '@/store/rainViewerRadarStore'

interface RainViewerOverlayProps {
  visible: boolean
}

export function RainViewerOverlay({ visible }: RainViewerOverlayProps) {
  const host = useRainViewerRadarStore((state) => state.host)
  const frames = useRainViewerRadarStore((state) => state.frames)
  const selectedFrameIndex = useRainViewerRadarStore((state) => state.selectedFrameIndex)
  const fetchRadar = useRainViewerRadarStore((state) => state.fetch)

  useEffect(() => {
    if (!visible) return undefined

    fetchRadar()
    const interval = setInterval(() => fetchRadar(true), 5 * 60 * 1_000)
    return () => {
      clearInterval(interval)
    }
  }, [fetchRadar, visible])

  const selectedFrame = frames[selectedFrameIndex] ?? frames[frames.length - 1]
  const tileTemplate = useMemo(() => {
    if (!host || frames.length === 0) return null
    return buildRainViewerTileTemplate(host, selectedFrame)
  }, [frames.length, host, selectedFrame])

  if (!tileTemplate || !visible || !selectedFrame) return null

  const sourceId = `center-rainviewer-radar-${selectedFrame.time}`
  const layerId = `center-rainviewer-radar-layer-${selectedFrame.time}`

  return (
    <RasterSource
      key={sourceId}
      id={sourceId}
      tileUrlTemplates={[tileTemplate]}
      tileSize={256}
      maxZoomLevel={6}
    >
      <RasterLayer id={layerId} sourceID={sourceId} style={{ rasterOpacity: 0.55 }} />
    </RasterSource>
  )
}

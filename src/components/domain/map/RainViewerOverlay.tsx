import { RasterLayer, RasterSource } from '@rnmapbox/maps'
import { useEffect, useState } from 'react'

interface RainViewerOverlayProps {
  visible: boolean
}

export function RainViewerOverlay({ visible }: RainViewerOverlayProps) {
  const [tileTemplate, setTileTemplate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchRadarFrame() {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
        if (!res.ok || cancelled) return
        const meta = await res.json()
        const frames: { path: string }[] = meta.radar?.past ?? []
        if (!frames.length || cancelled) return
        const latest = frames[frames.length - 1]
        setTileTemplate(`${meta.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`)
      } catch {
        // network errors ignored in prototype
      }
    }

    fetchRadarFrame()
    const interval = setInterval(fetchRadarFrame, 5 * 60 * 1_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (!tileTemplate || !visible) return null

  return (
    <RasterSource
      id="center-rainviewer-radar"
      tileUrlTemplates={[tileTemplate]}
      tileSize={256}
      maxZoomLevel={6}
    >
      <RasterLayer
        id="center-rainviewer-radar-layer"
        sourceID="center-rainviewer-radar"
        style={{ rasterOpacity: 0.55 }}
      />
    </RasterSource>
  )
}

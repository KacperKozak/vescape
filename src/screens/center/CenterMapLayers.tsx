import {
  CircleLayer,
  FillExtrusionLayer,
  FillLayer,
  Images,
  LineLayer,
  RasterLayer,
  RasterSource,
  ShapeSource,
  SymbolLayer,
} from '@rnmapbox/maps'
import { useEffect, useMemo, useState } from 'react'
import type { MapPoint, MapPointKind } from 'vesc-ble'

import { MediaHistoryPin } from '@/components/domain/history/MediaHistoryPin'
import { MapPin } from '@/components/domain/map/MapPin'
import { RainViewerOverlay } from '@/components/domain/map/RainViewerOverlay'
import { MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { MAP_DEFAULTS } from '@/constants/mapStyles'
import { getMapPointKindIcon } from '@/constants/mapPointIcons'
import {
  getMapPointKindColor,
  getMapPointKindLabel,
  getMapPointKindTextColor,
} from '@/constants/mapPoints'
import { theme } from '@/constants/theme'
import { makeCircleFeature, makeTrailLineString } from '@/helpers/mapGeometry'
import { findNearestSampleIndexByTime } from '@/lib/history/playback'
import { resolveMarkerRenderData } from '@/lib/history/markerOverlap'
import {
  clusterMediaHistoryAssets,
  MEDIA_CLUSTER_DISTANCE_M,
  type MediaHistoryAsset,
} from '@/lib/history/mediaHistory'
import type { HistoryMetricKey } from '@/lib/history/metricColorScale'
import { isMapPointKindVisible } from '@/lib/mapPointVisibility'
import type { HistoryGpsSample, HistoryMarker, TelemetrySample } from '@/store/historyStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCenterScreenStore } from '@/screens/center/centerScreenStore'

import {
  HISTORY_MARKER_COLORS,
  HISTORY_MARKER_ICONS,
  type SelectedHistoryMarker,
} from './historyMapMarkerInfo'
import {
  DESTINATION_POINT_COLOR,
  DESTINATION_POINT_TEXT_COLOR,
  GPS_POINT_COLOR,
} from './offscreenMapIndicators'
import {
  getHistoryMetricBaseColor,
  getHistoryRouteHighlightDurationMs,
  getHistoryRouteHighlightGradient,
  getHistoryRouteMetricGradient,
} from './historyRouteGradient'

const GPS_HEADING_ICON_ID = 'center-gps-heading'
const GPS_HEADING_ICON = require('@rnmapbox/maps/src/assets/heading.png')
const HISTORY_ROUTE_HIGHLIGHT_INTERVAL_MS = 50
const HISTORY_ROUTE_HIGHLIGHT_DELAY_MS = 500

interface CenterMapLayersProps {
  historyActive: boolean
  expandSelectedMapPoints: boolean
  isMapy: boolean
  isOneDark: boolean
  showBuildings3d: boolean
  weatherActive: boolean
  liveTrailShape: ReturnType<typeof makeTrailLineString> | null
  rideRouteShape: {
    type: 'Feature'
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    properties: Record<string, never>
  } | null
  accuracyFix: { longitude: number; latitude: number } | null
  accuracyShape: ReturnType<typeof makeCircleFeature> | null
  gpsPuckBearingDeg: number | null
  rideRoute: [number, number][]
  rideTelemetrySamples: TelemetrySample[]
  activeHistoryMapMetric: HistoryMetricKey
  rideMarkers: HistoryMarker[]
  rideGpsSamples: HistoryGpsSample[]
  mediaAssets: MediaHistoryAsset[]
  mapZoom: number
  directionPoint: MapPoint | null
  mapPoints: MapPoint[]
  selectedMapPointId: string | null
  hiddenMapPointKinds: MapPointKind[]
  onClearDirectionPoint: () => void
  onToggleMapPointSelection: (id: string) => void
  onRemoveMapPoint: (id: string) => void
  onSuppressNextMapPress: () => void
  onSelectMarker: (selection: SelectedHistoryMarker) => void
  onOpenMedia: (asset: MediaHistoryAsset) => void
}

function LiveMapLayers({
  liveTrailShape,
  accuracyFix,
  accuracyShape,
  gpsPuckBearingDeg,
}: {
  liveTrailShape: CenterMapLayersProps['liveTrailShape']
  accuracyFix: CenterMapLayersProps['accuracyFix']
  accuracyShape: CenterMapLayersProps['accuracyShape']
  gpsPuckBearingDeg: CenterMapLayersProps['gpsPuckBearingDeg']
}) {
  const gpsPuckShape = useMemo(
    () =>
      accuracyFix && gpsPuckBearingDeg != null
        ? ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [accuracyFix.longitude, accuracyFix.latitude],
                },
                properties: { bearing: gpsPuckBearingDeg },
              },
            ],
          } as GeoJSON.FeatureCollection)
        : null,
    [accuracyFix, gpsPuckBearingDeg],
  )

  return (
    <>
      {liveTrailShape && (
        <ShapeSource id="center-live-trail-source" shape={liveTrailShape} lineMetrics>
          <LineLayer
            id="center-live-trail-line"
            style={{
              lineColor: MAP_DEFAULTS.trailColor,
              lineWidth: MAP_DEFAULTS.trailWidth,
              lineCap: 'round',
              lineJoin: 'round',
              lineGradient: [
                'interpolate',
                ['linear'],
                ['line-progress'],
                0,
                MAP_DEFAULTS.trailGradientStart,
                1,
                MAP_DEFAULTS.trailGradientEnd,
              ],
            }}
          />
        </ShapeSource>
      )}
      {accuracyFix && (
        <>
          {accuracyShape && (
            <ShapeSource id="center-gps-accuracy-source" shape={accuracyShape}>
              <FillLayer
                id="center-gps-accuracy-fill"
                style={{ fillColor: MAP_DEFAULTS.accuracyFillColor }}
              />
            </ShapeSource>
          )}
          {gpsPuckShape ? (
            <>
              <Images images={{ [GPS_HEADING_ICON_ID]: { image: GPS_HEADING_ICON, sdf: true } }} />
              <ShapeSource id="center-gps-puck-source" shape={gpsPuckShape}>
                <CircleLayer
                  id="center-gps-puck-core"
                  style={{
                    circleRadius: 8,
                    circleColor: GPS_POINT_COLOR,
                    circleStrokeColor: theme.palette.mono.white,
                    circleStrokeWidth: 3,
                  }}
                />
                <SymbolLayer
                  id="center-gps-puck-heading-outline"
                  style={{
                    iconImage: GPS_HEADING_ICON_ID,
                    iconRotate: ['get', 'bearing'],
                    iconAllowOverlap: true,
                    iconIgnorePlacement: true,
                    iconRotationAlignment: 'map',
                    iconSize: 0.95,
                    iconOffset: [0, -10],
                    iconColor: theme.palette.mono.white,
                  }}
                />
              </ShapeSource>
            </>
          ) : (
            <MapPin
              id="center-gps-position"
              coordinate={[accuracyFix.longitude, accuracyFix.latitude]}
              color={GPS_POINT_COLOR}
            />
          )}
        </>
      )}
    </>
  )
}

// Subscribes to the scrub head directly so dragging the telemetry chart only re-renders this pin,
// not the whole map/overlay tree. rideGpsSamples is a stable prop (changes only on session switch).
function SeekPositionPin({ rideGpsSamples }: { rideGpsSamples: HistoryGpsSample[] }) {
  const seekTimeMs = useCenterScreenStore((s) => s.seekTimeMs)
  const seekPosition = useMemo(() => {
    if (seekTimeMs == null || rideGpsSamples.length === 0) return null
    const idx = findNearestSampleIndexByTime(rideGpsSamples, seekTimeMs)
    return idx >= 0 ? rideGpsSamples[idx] : null
  }, [seekTimeMs, rideGpsSamples])

  if (!seekPosition || seekPosition.latitude == null || seekPosition.longitude == null) return null
  return (
    <MapPin
      id="center-seek-position"
      coordinate={[seekPosition.longitude, seekPosition.latitude]}
      color={MAP_DEFAULTS.markerColor}
    />
  )
}

function HistoryMapLayers({
  rideRouteShape,
  rideRoute,
  rideTelemetrySamples,
  activeHistoryMapMetric,
  rideMarkers,
  rideGpsSamples,
  mediaAssets,
  mapZoom,
  onSuppressNextMapPress,
  onSelectMarker,
  onOpenMedia,
}: {
  rideRouteShape: CenterMapLayersProps['rideRouteShape']
  rideRoute: CenterMapLayersProps['rideRoute']
  rideTelemetrySamples: CenterMapLayersProps['rideTelemetrySamples']
  activeHistoryMapMetric: CenterMapLayersProps['activeHistoryMapMetric']
  rideMarkers: CenterMapLayersProps['rideMarkers']
  rideGpsSamples: CenterMapLayersProps['rideGpsSamples']
  mediaAssets: CenterMapLayersProps['mediaAssets']
  mapZoom: CenterMapLayersProps['mapZoom']
  onSuppressNextMapPress: CenterMapLayersProps['onSuppressNextMapPress']
  onSelectMarker: CenterMapLayersProps['onSelectMarker']
  onOpenMedia: CenterMapLayersProps['onOpenMedia']
}) {
  const [highlightProgress, setHighlightProgress] = useState(0)
  const highlightDurationMs = useMemo(
    () => getHistoryRouteHighlightDurationMs(rideRoute),
    [rideRoute],
  )

  useEffect(() => {
    if (!rideRouteShape) return
    const resetFrame = requestAnimationFrame(() => setHighlightProgress(0))
    let interval: ReturnType<typeof setInterval> | null = null
    const timeout = setTimeout(() => {
      const startedAt = Date.now()
      interval = setInterval(() => {
        const progress = (Date.now() - startedAt) / highlightDurationMs
        setHighlightProgress(Math.min(1, progress))
        if (progress >= 1 && interval) clearInterval(interval)
      }, HISTORY_ROUTE_HIGHLIGHT_INTERVAL_MS)
    }, HISTORY_ROUTE_HIGHLIGHT_DELAY_MS)
    return () => {
      cancelAnimationFrame(resetFrame)
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [highlightDurationMs, rideRouteShape])

  const routeHighlightGradient = useMemo(
    () => getHistoryRouteHighlightGradient(highlightProgress),
    [highlightProgress],
  )
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const routeMetricGradient = useMemo(
    () =>
      getHistoryRouteMetricGradient({
        gpsSamples: rideGpsSamples,
        telemetrySamples: rideTelemetrySamples,
        metric: activeHistoryMapMetric,
        hotRanges,
        gradientsEnabled,
      }),
    [activeHistoryMapMetric, gradientsEnabled, hotRanges, rideGpsSamples, rideTelemetrySamples],
  )
  const mediaClusters = useMemo(
    () =>
      clusterMediaHistoryAssets(
        mediaAssets,
        MEDIA_CLUSTER_DISTANCE_M * 2 ** Math.max(0, Math.min(8, 16 - mapZoom)),
      ),
    [mapZoom, mediaAssets],
  )

  return (
    <>
      {rideRouteShape && (
        <ShapeSource id="center-ride-route-source" shape={rideRouteShape} lineMetrics>
          <LineLayer
            id="center-ride-route-line"
            style={{
              lineColor: getHistoryMetricBaseColor(activeHistoryMapMetric),
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
              ...(routeMetricGradient ? { lineGradient: routeMetricGradient } : {}),
            }}
          />
          <LineLayer
            id="center-ride-route-highlight"
            style={{
              lineGradient: routeHighlightGradient,
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>
      )}
      {rideRoute[0] && (
        <MapPin
          id="center-ride-start"
          coordinate={rideRoute[0]}
          color={theme.palette.green.color}
        />
      )}
      {rideRoute.at(-1) && (
        <MapPin
          id="center-ride-end"
          coordinate={rideRoute.at(-1)!}
          color={theme.status.error.color}
        />
      )}
      <SeekPositionPin rideGpsSamples={rideGpsSamples} />

      {resolveMarkerRenderData(rideMarkers, rideGpsSamples).map(
        ({ marker, gps, renderCoordinate }) => (
          <MapPin
            key={marker.id}
            id={`center-ride-marker-${marker.id}`}
            coordinate={renderCoordinate}
            color={HISTORY_MARKER_COLORS[marker.type]}
            icon={HISTORY_MARKER_ICONS[marker.type]}
            onSelected={() => {
              onSuppressNextMapPress()
              onSelectMarker({ marker, gps })
            }}
          />
        ),
      )}
      {mediaClusters.map((cluster) => (
        <MediaHistoryPin
          key={cluster.id}
          cluster={cluster}
          onPress={() => {
            onSuppressNextMapPress()
            onOpenMedia(cluster.assets[0])
          }}
        />
      ))}
    </>
  )
}

export function CenterMapLayers({
  historyActive,
  expandSelectedMapPoints,
  isMapy,
  isOneDark,
  showBuildings3d,
  weatherActive,
  liveTrailShape,
  rideRouteShape,
  accuracyFix,
  accuracyShape,
  gpsPuckBearingDeg,
  rideRoute,
  rideTelemetrySamples,
  activeHistoryMapMetric,
  rideMarkers,
  rideGpsSamples,
  mediaAssets,
  mapZoom,
  directionPoint,
  mapPoints,
  selectedMapPointId,
  hiddenMapPointKinds,
  onClearDirectionPoint,
  onToggleMapPointSelection,
  onRemoveMapPoint,
  onSuppressNextMapPress,
  onSelectMarker,
  onOpenMedia,
}: CenterMapLayersProps) {
  const selectedMapPoint = useMemo(
    () =>
      mapPoints.find(
        (point) =>
          point.id === selectedMapPointId && isMapPointKindVisible(point.kind, hiddenMapPointKinds),
      ) ?? null,
    [hiddenMapPointKinds, mapPoints, selectedMapPointId],
  )

  return (
    <>
      {showBuildings3d && (
        <FillExtrusionLayer
          id="center-3d-buildings"
          sourceLayerID="building"
          minZoomLevel={14}
          maxZoomLevel={22}
          style={{
            fillExtrusionColor: isOneDark ? theme.map.buildingDark : theme.map.buildingLight,
            fillExtrusionHeight: ['coalesce', ['get', 'height'], 12],
            fillExtrusionBase: ['coalesce', ['get', 'min_height'], 0],
            fillExtrusionOpacity: isOneDark ? 0.65 : 0.42,
            fillExtrusionVerticalGradient: true,
          }}
        />
      )}
      {isMapy && MAPY_TILE_URL_TEMPLATE ? (
        <RasterSource
          id="center-mapy-tiles"
          tileUrlTemplates={[MAPY_TILE_URL_TEMPLATE]}
          tileSize={256}
          maxZoomLevel={MAP_DEFAULTS.maxZoom}
        >
          <RasterLayer id="center-mapy-tiles-layer" sourceID="center-mapy-tiles" style={{}} />
        </RasterSource>
      ) : null}
      <RainViewerOverlay visible={weatherActive} />
      {historyActive ? (
        <HistoryMapLayers
          rideRouteShape={rideRouteShape}
          rideRoute={rideRoute}
          rideTelemetrySamples={rideTelemetrySamples}
          activeHistoryMapMetric={activeHistoryMapMetric}
          rideMarkers={rideMarkers}
          rideGpsSamples={rideGpsSamples}
          mediaAssets={mediaAssets}
          mapZoom={mapZoom}
          onSuppressNextMapPress={onSuppressNextMapPress}
          onSelectMarker={onSelectMarker}
          onOpenMedia={onOpenMedia}
        />
      ) : (
        <LiveMapLayers
          liveTrailShape={liveTrailShape}
          accuracyFix={accuracyFix}
          accuracyShape={accuracyShape}
          gpsPuckBearingDeg={gpsPuckBearingDeg}
        />
      )}
      {directionPoint && !historyActive && (
        <MapPin
          id="center-direction-position"
          coordinate={[directionPoint.longitude, directionPoint.latitude]}
          color={DESTINATION_POINT_COLOR}
          icon={getMapPointKindIcon(directionPoint.kind)}
          iconColor={DESTINATION_POINT_TEXT_COLOR}
          onSelected={() => {
            onSuppressNextMapPress()
            onClearDirectionPoint()
          }}
        />
      )}
      {!historyActive &&
        mapPoints
          .filter(
            (point) =>
              point.kind !== 'direction' && isMapPointKindVisible(point.kind, hiddenMapPointKinds),
          )
          .map((point) => (
            <MapPin
              key={point.id}
              id={`center-map-point-${point.id}`}
              coordinate={[point.longitude, point.latitude]}
              color={getMapPointKindColor(point.kind)}
              icon={getMapPointKindIcon(point.kind)}
              iconColor={getMapPointKindTextColor(point.kind)}
              selected={selectedMapPoint?.id === point.id}
              expandSelected={expandSelectedMapPoints}
              label={getMapPointKindLabel(point.kind)}
              onSelected={() => {
                onSuppressNextMapPress()
                onToggleMapPointSelection(point.id)
              }}
              onRemove={() => {
                onSuppressNextMapPress()
                onRemoveMapPoint(point.id)
              }}
            />
          ))}
    </>
  )
}

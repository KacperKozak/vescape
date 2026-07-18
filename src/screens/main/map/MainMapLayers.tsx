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
import type { MapPoint, MapPointKind } from 'vescape-core'

import { MediaHistoryPin } from '@/modules/history/components/MediaHistoryPin'
import { MapPin } from '@/modules/map/components/MapPin'
import { RainViewerOverlay } from '@/modules/weather/components/RainViewerOverlay'
import { MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { MAP_DEFAULTS } from '@/modules/map/constants/mapStyles'
import { getMapPointKindIcon } from '@/modules/map/constants/mapPointIcons'
import {
  getMapPointKindColor,
  getMapPointKindLabel,
  getMapPointKindTextColor,
} from '@/modules/map/constants/mapPoints'
import { theme } from '@/constants/theme'
import { makeCircleFeature, makeTrailLineString } from '@/helpers/mapGeometry'
import { findNearestSampleIndexByTime } from '@/modules/history/lib/playback'
import { resolveMarkerRenderData } from '@/modules/history/lib/markerOverlap'
import {
  clusterMediaHistoryAssets,
  MEDIA_CLUSTER_DISTANCE_M,
  type MediaHistoryAsset,
} from '@/modules/history/lib/mediaHistory'
import type {
  HistoryMetricKey,
  HistoryMetricHotRanges,
} from '@/modules/history/lib/metricColorScale'
import { isMapPointKindVisible } from '@/modules/map/lib/mapPointVisibility'
import type {
  HistoryGpsSample,
  HistoryMarker,
  TelemetrySample,
} from '@/modules/history/store/historyStore'
import { useRiderStore } from '@/modules/group-ride/store/riderStore'
import type { RosterRider } from '@/modules/group-ride/lib/roster'
import { useMainScreenStore } from '@/screens/main/mainScreenStore'

import {
  HISTORY_MARKER_COLORS,
  HISTORY_MARKER_ICONS,
  type SelectedHistoryMarker,
} from '@/modules/history/lib/historyMapMarkerInfo'
import {
  DESTINATION_POINT_COLOR,
  DESTINATION_POINT_TEXT_COLOR,
  GPS_POINT_COLOR,
} from '@/screens/main/map/offscreenMapIndicators'
import {
  getHistoryMetricBaseColor,
  getHistoryRouteHighlightDurationMs,
  getHistoryRouteHighlightGradient,
  getHistoryRouteMetricGradient,
} from '@/modules/history/lib/historyRouteGradient'
import type { LegalLimitCountry } from '@/modules/legal/lib/legalLimits'
import { LegalLimitsMapLayer } from '@/modules/legal/components/LegalLimitsMapLayer'
import { RiderPresencePin, RiderTrail } from '@/modules/group-ride/components/RiderMapLayers'
import { rosterRiderColor } from '@/modules/group-ride/lib/riderColor'

const GPS_HEADING_ICON_ID = 'center-gps-heading'
const GPS_HEADING_ICON = require('@rnmapbox/maps/src/assets/heading.png')
const HISTORY_ROUTE_HIGHLIGHT_INTERVAL_MS = 50
const HISTORY_ROUTE_HIGHLIGHT_DELAY_MS = 500
interface MainMapLayersProps {
  historyActive: boolean
  expandSelectedMapPoints: boolean
  isMapy: boolean
  isOneDark: boolean
  isSatellite: boolean
  showBuildings3d: boolean
  weatherActive: boolean
  legalLimitsActive: boolean
  liveTrailShape: ReturnType<typeof makeTrailLineString> | null
  rideRouteShape: {
    type: 'Feature'
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    properties: Record<string, never>
  } | null
  accuracyFix: { longitude: number; latitude: number } | null
  accuracyShape: ReturnType<typeof makeCircleFeature> | null
  gpsPuckBearingDeg: number | null
  riders: RosterRider[]
  rideRoute: [number, number][]
  rideTelemetrySamples: TelemetrySample[]
  activeHistoryMapMetric: HistoryMetricKey
  rideMarkers: HistoryMarker[]
  rideGpsSamples: HistoryGpsSample[]
  mediaAssets: MediaHistoryAsset[]
  mapZoom: number
  historyMetricGradientsEnabled: boolean
  historyMetricHotRanges: HistoryMetricHotRanges
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
  onSelectLegalCountry: (country: LegalLimitCountry) => void
}

function LiveMapLayers({
  liveTrailShape,
  accuracyFix,
  accuracyShape,
  gpsPuckBearingDeg,
  riders,
  highContrastRoutes,
}: {
  liveTrailShape: MainMapLayersProps['liveTrailShape']
  accuracyFix: MainMapLayersProps['accuracyFix']
  accuracyShape: MainMapLayersProps['accuracyShape']
  gpsPuckBearingDeg: MainMapLayersProps['gpsPuckBearingDeg']
  riders: MainMapLayersProps['riders']
  highContrastRoutes: boolean
}) {
  const riderColor = useRiderStore((state) => state.riderColor)
  const gpsPointColor = riderColor ?? GPS_POINT_COLOR
  const trailColor = riderColor ?? MAP_DEFAULTS.trailColor
  const trailGradientStart = riderColor
    ? theme.alpha(riderColor, 0)
    : MAP_DEFAULTS.trailGradientStart
  const trailGradientEnd = riderColor
    ? theme.alpha(riderColor, 0.85)
    : MAP_DEFAULTS.trailGradientEnd
  const gpsPuckPositionShape = useMemo(
    () =>
      accuracyFix
        ? ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [accuracyFix.longitude, accuracyFix.latitude],
            },
            properties: {},
          } as GeoJSON.Feature<GeoJSON.Point>)
        : null,
    [accuracyFix],
  )
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
            id="center-live-trail-casing"
            style={{
              lineColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
              lineWidth: highContrastRoutes ? MAP_DEFAULTS.trailWidth + 4 : 0,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <LineLayer
            id="center-live-trail-line"
            style={{
              lineColor: trailColor,
              lineWidth: MAP_DEFAULTS.trailWidth,
              lineCap: 'round',
              lineJoin: 'round',
              lineGradient: [
                'interpolate',
                ['linear'],
                ['line-progress'],
                0,
                trailGradientStart,
                1,
                trailGradientEnd,
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
          {gpsPuckPositionShape && (
            <ShapeSource id="center-gps-puck-position-source" shape={gpsPuckPositionShape}>
              <CircleLayer
                id="center-gps-puck-core"
                style={{
                  circleRadius: 8,
                  circleColor: gpsPointColor,
                  circleStrokeColor: theme.palette.mono.white,
                  circleStrokeWidth: 3,
                }}
              />
            </ShapeSource>
          )}
          {gpsPuckShape && (
            <>
              <Images images={{ [GPS_HEADING_ICON_ID]: { image: GPS_HEADING_ICON, sdf: true } }} />
              <ShapeSource id="center-gps-puck-heading-source" shape={gpsPuckShape}>
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
          )}
        </>
      )}
      {riders.map((rider, index) =>
        rider.trail && rider.trail.length >= 2 ? (
          <RiderTrail
            key={rider.id}
            rider={rider}
            index={index}
            highContrastRoutes={highContrastRoutes}
          />
        ) : null,
      )}
      {riders.map((rider, index) =>
        rider.presence ? <RiderPresencePin key={rider.id} rider={rider} index={index} /> : null,
      )}
    </>
  )
}

// Subscribes to the scrub head directly so dragging the telemetry chart only re-renders this pin,
// not the whole map/overlay tree. rideGpsSamples is a stable prop (changes only on session switch).
function SeekPositionPin({ rideGpsSamples }: { rideGpsSamples: HistoryGpsSample[] }) {
  const seekTimeMs = useMainScreenStore((s) => s.seekTimeMs)
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

export function HistoryMapLayers({
  rideRouteShape,
  rideRoute,
  rideTelemetrySamples,
  activeHistoryMapMetric,
  rideMarkers,
  rideGpsSamples,
  mediaAssets,
  mapZoom,
  historyMetricGradientsEnabled: gradientsEnabled,
  historyMetricHotRanges: hotRanges,
  onSuppressNextMapPress,
  onSelectMarker,
  onOpenMedia,
  highContrastRoutes,
}: {
  rideRouteShape: MainMapLayersProps['rideRouteShape']
  rideRoute: MainMapLayersProps['rideRoute']
  rideTelemetrySamples: MainMapLayersProps['rideTelemetrySamples']
  activeHistoryMapMetric: MainMapLayersProps['activeHistoryMapMetric']
  rideMarkers: MainMapLayersProps['rideMarkers']
  rideGpsSamples: MainMapLayersProps['rideGpsSamples']
  mediaAssets: MainMapLayersProps['mediaAssets']
  mapZoom: MainMapLayersProps['mapZoom']
  historyMetricGradientsEnabled: MainMapLayersProps['historyMetricGradientsEnabled']
  historyMetricHotRanges: MainMapLayersProps['historyMetricHotRanges']
  onSuppressNextMapPress: MainMapLayersProps['onSuppressNextMapPress']
  onSelectMarker: MainMapLayersProps['onSelectMarker']
  onOpenMedia: MainMapLayersProps['onOpenMedia']
  highContrastRoutes: boolean
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
            id="center-ride-route-casing"
            style={{
              lineColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
              lineWidth: highContrastRoutes ? 8 : 0,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <LineLayer
            id="center-ride-route-line"
            style={{
              lineColor: getHistoryMetricBaseColor(activeHistoryMapMetric),
              lineWidth: highContrastRoutes ? 5 : 4,
              lineCap: 'round',
              lineJoin: 'round',
              ...(routeMetricGradient ? { lineGradient: routeMetricGradient } : {}),
            }}
          />
          <LineLayer
            id="center-ride-route-highlight"
            style={{
              lineGradient: routeHighlightGradient,
              lineWidth: highContrastRoutes ? 5 : 4,
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

export function MainMapLayers({
  historyActive,
  expandSelectedMapPoints,
  isMapy,
  isOneDark,
  isSatellite,
  showBuildings3d,
  weatherActive,
  legalLimitsActive,
  liveTrailShape,
  rideRouteShape,
  accuracyFix,
  accuracyShape,
  gpsPuckBearingDeg,
  riders,
  rideRoute,
  rideTelemetrySamples,
  activeHistoryMapMetric,
  rideMarkers,
  rideGpsSamples,
  mediaAssets,
  mapZoom,
  historyMetricGradientsEnabled,
  historyMetricHotRanges,
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
  onSelectLegalCountry,
}: MainMapLayersProps) {
  const riderColor = useRiderStore((state) => state.riderColor)
  const directionColor = riderColor ?? DESTINATION_POINT_COLOR
  const directionTextColor = riderColor ?? DESTINATION_POINT_TEXT_COLOR
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
      {legalLimitsActive ? <LegalLimitsMapLayer onSelectCountry={onSelectLegalCountry} /> : null}
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
          historyMetricGradientsEnabled={historyMetricGradientsEnabled}
          historyMetricHotRanges={historyMetricHotRanges}
          onSuppressNextMapPress={onSuppressNextMapPress}
          onSelectMarker={onSelectMarker}
          onOpenMedia={onOpenMedia}
          highContrastRoutes={isSatellite}
        />
      ) : (
        <LiveMapLayers
          liveTrailShape={liveTrailShape}
          accuracyFix={accuracyFix}
          accuracyShape={accuracyShape}
          gpsPuckBearingDeg={gpsPuckBearingDeg}
          riders={riders}
          highContrastRoutes={isSatellite}
        />
      )}
      {directionPoint && !historyActive && (
        <MapPin
          // Color in the key: PointAnnotation snapshots its children natively, so a
          // rider-color change must remount the pin to re-render.
          key={`center-direction-position-${directionColor}`}
          id="center-direction-position"
          coordinate={[directionPoint.longitude, directionPoint.latitude]}
          color={directionColor}
          icon={getMapPointKindIcon(directionPoint.kind)}
          iconColor={directionTextColor}
          onSelected={() => {
            onSuppressNextMapPress()
            onClearDirectionPoint()
          }}
        />
      )}
      {!historyActive &&
        riders.map((rider, index) =>
          rider.presence?.target ? (
            <MapPin
              // Color in the key: PointAnnotation snapshots its children natively, so a
              // color change must remount the pin to re-render.
              key={`center-rider-target-${rider.id}-${rosterRiderColor(rider, index)}`}
              id={`center-rider-target-${rider.id}`}
              coordinate={[rider.presence.target.lng, rider.presence.target.lat]}
              color={rosterRiderColor(rider, index)}
              icon={getMapPointKindIcon('direction')}
            />
          ) : null,
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

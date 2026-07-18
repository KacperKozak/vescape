import {
  CircleLayer,
  FillExtrusionLayer,
  FillLayer,
  Images,
  LineLayer,
  MarkerView,
  RasterLayer,
  RasterSource,
  ShapeSource,
  SymbolLayer,
  VectorSource,
} from '@rnmapbox/maps'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { withTiming } from 'react-native-reanimated'
import { Text } from '@/components/ui/base/Text'
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
import type { MapSelection } from '@/lib/map/mapSelection'
import { resolveMarkerRenderData } from '@/lib/history/markerOverlap'
import {
  clusterMediaHistoryAssets,
  MEDIA_CLUSTER_DISTANCE_M,
  type MediaHistoryAsset,
} from '@/lib/history/mediaHistory'
import type { HistoryMetricKey, HistoryMetricHotRanges } from '@/lib/history/metricColorScale'
import { isMapPointKindVisible } from '@/lib/mapPointVisibility'
import type { HistoryGpsSample, HistoryMarker, TelemetrySample } from '@/store/historyStore'
import { useRiderStore } from '@/store/riderStore'
import type { RosterRider } from '@/lib/groupRide/roster'
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
import {
  getLegalLimitCountryByCode,
  legalCountryFilterExpression,
  legalLimitLabelShape,
  legalStatusColorExpression,
  type LegalLimitCountry,
} from '@/lib/legal/legalLimits'

const GPS_HEADING_ICON_ID = 'center-gps-heading'
const GPS_HEADING_ICON = require('@rnmapbox/maps/src/assets/heading.png')
const HISTORY_ROUTE_HIGHLIGHT_INTERVAL_MS = 50
const HISTORY_ROUTE_HIGHLIGHT_DELAY_MS = 500
const RIDER_COLORS = [
  theme.palette.cyan.color,
  theme.palette.green.color,
  theme.palette.amber.color,
  theme.palette.fuchsia.color,
  theme.palette.sky.color,
]
const LEGAL_LIMIT_LABEL_SHAPE = legalLimitLabelShape()

function LegalLimitsMapLayer({
  onSelectCountry,
}: {
  onSelectCountry: (country: LegalLimitCountry) => void
}) {
  const handlePress = (event: { features: GeoJSON.Feature[] }) => {
    const alpha3 = event.features
      .map((feature) => feature.properties?.iso_3166_1_alpha_3)
      .find((value): value is string => typeof value === 'string')
    if (!alpha3) return
    const country = getLegalLimitCountryByCode(alpha3)
    if (country) onSelectCountry(country)
  }
  const handleLabelPress = (event: { features: GeoJSON.Feature[] }) => {
    const code = event.features
      .map((feature) => feature.properties?.code)
      .find((value): value is string => typeof value === 'string')
    if (!code) return
    const country = getLegalLimitCountryByCode(code)
    if (country) onSelectCountry(country)
  }

  return (
    <>
      <VectorSource
        id="legal-country-boundaries"
        url="mapbox://mapbox.country-boundaries-v1"
        hitbox={{ width: 44, height: 44 }}
        onPress={handlePress}
      >
        <FillLayer
          id="legal-country-fill"
          sourceLayerID="country_boundaries"
          filter={legalCountryFilterExpression() as never}
          style={{
            fillColor: legalStatusColorExpression() as never,
            fillOpacity: 0.48,
            fillOutlineColor: theme.alpha(theme.palette.mono.white, 0.7),
          }}
        />
        <LineLayer
          id="legal-country-outline"
          sourceLayerID="country_boundaries"
          filter={legalCountryFilterExpression() as never}
          style={{
            lineColor: theme.alpha(theme.palette.mono.white, 0.85),
            lineWidth: ['interpolate', ['linear'], ['zoom'], 3, 0.75, 6, 1.6],
          }}
        />
      </VectorSource>
      <ShapeSource
        id="legal-speed-labels"
        shape={LEGAL_LIMIT_LABEL_SHAPE}
        hitbox={{ width: 44, height: 44 }}
        onPress={handleLabelPress}
      >
        <SymbolLayer
          id="legal-speed-label"
          style={{
            textField: ['get', 'label'],
            textSize: ['interpolate', ['linear'], ['zoom'], 3, 18, 5, 28],
            textColor: theme.palette.mono.white,
            textHaloColor: theme.alpha(theme.palette.slate.surfaceDeep, 1),
            textHaloWidth: 2,
            textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
        <SymbolLayer
          id="legal-speed-unit-label"
          style={{
            textField: ['get', 'subtitle'],
            textSize: ['interpolate', ['linear'], ['zoom'], 3, 8, 5, 11],
            textColor: theme.alpha(theme.palette.mono.white, 0.8),
            textHaloColor: theme.alpha(theme.palette.slate.surfaceDeep, 1),
            textHaloWidth: 1.5,
            textOffset: [0, 1.65],
            textFont: ['Open Sans Semibold', 'Arial Unicode MS Regular'],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
      </ShapeSource>
    </>
  )
}

interface CenterMapLayersProps {
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
  activeNavigationTarget: MapSelection | null
  selectedNavigationTarget: MapSelection | null
  mapPoints: MapPoint[]
  selectedMapPointId: string | null
  hiddenMapPointKinds: MapPointKind[]
  onToggleMapPointSelection: (id: string) => void
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
  liveTrailShape: CenterMapLayersProps['liveTrailShape']
  accuracyFix: CenterMapLayersProps['accuracyFix']
  accuracyShape: CenterMapLayersProps['accuracyShape']
  gpsPuckBearingDeg: CenterMapLayersProps['gpsPuckBearingDeg']
  riders: CenterMapLayersProps['riders']
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

/** Marker/trail tint for a Rider: their chosen color, a palette fallback, or muted when stale. */
export function rosterRiderColor(rider: RosterRider, index: number): string {
  return rider.stale
    ? theme.palette.slate.textMuted
    : (rider.color ?? RIDER_COLORS[index % RIDER_COLORS.length])
}

// A peer's recent path, tinted like their marker and fading out toward the tail —
// the group-ride counterpart to the device's own live trail.
function RiderTrail({
  rider,
  index,
  highContrastRoutes,
}: {
  rider: RosterRider
  index: number
  highContrastRoutes: boolean
}) {
  const color = rosterRiderColor(rider, index)
  const shape = useMemo(
    () =>
      rider.trail && rider.trail.length >= 2
        ? makeTrailLineString(rider.trail.map((p) => ({ longitude: p.lng, latitude: p.lat })))
        : null,
    [rider.trail],
  )
  if (!shape) return null

  return (
    <ShapeSource id={`center-rider-trail-source-${rider.id}`} shape={shape} lineMetrics>
      <LineLayer
        id={`center-rider-trail-casing-${rider.id}`}
        style={{
          lineColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
          lineWidth: highContrastRoutes ? MAP_DEFAULTS.trailWidth + 4 : 0,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <LineLayer
        id={`center-rider-trail-line-${rider.id}`}
        style={{
          lineColor: color,
          lineWidth: MAP_DEFAULTS.trailWidth,
          lineCap: 'round',
          lineJoin: 'round',
          lineGradient: [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0,
            theme.alpha(color, 0),
            1,
            theme.alpha(color, 0.85),
          ],
        }}
      />
    </ShapeSource>
  )
}

function RiderPresencePin({ rider, index }: { rider: RosterRider; index: number }) {
  const color = rosterRiderColor(rider, index)
  const heading = rider.presence?.heading ?? null
  if (!rider.presence) return null

  return (
    <MarkerView coordinate={[rider.presence.lng, rider.presence.lat]} allowOverlap>
      <View style={styles.riderMarker}>
        <View style={[styles.riderDot, { backgroundColor: color }]}>
          {heading != null && (
            // Rotating a ring centered on the dot keeps the arrow orbiting the dot;
            // rotating the arrow itself would spin it in place at a fixed offset.
            <View style={[styles.riderHeadingRing, { transform: [{ rotate: `${heading}deg` }] }]}>
              <View style={[styles.riderHeadingArrow, { borderBottomColor: color }]} />
            </View>
          )}
        </View>
        <Text style={[styles.riderLabel, rider.stale && styles.riderLabelStale]} numberOfLines={1}>
          {rider.name || 'Rider'}
        </Text>
      </View>
    </MarkerView>
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

function PendingNavigationTargetPin({
  coordinate,
  color,
}: {
  coordinate: [number, number]
  color: string
}) {
  return (
    <MarkerView coordinate={coordinate} allowOverlap>
      <Animated.View
        entering={pendingNavigationTargetEntering}
        style={[styles.pendingNavigationTarget, { borderColor: color }]}
      >
        <View style={[styles.pendingNavigationTargetCore, { backgroundColor: color }]} />
      </Animated.View>
    </MarkerView>
  )
}

const pendingNavigationTargetEntering = () => {
  'worklet'
  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: 1.8 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 260 }),
      transform: [{ scale: withTiming(1, { duration: 260 }) }],
    },
  }
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
  rideRouteShape: CenterMapLayersProps['rideRouteShape']
  rideRoute: CenterMapLayersProps['rideRoute']
  rideTelemetrySamples: CenterMapLayersProps['rideTelemetrySamples']
  activeHistoryMapMetric: CenterMapLayersProps['activeHistoryMapMetric']
  rideMarkers: CenterMapLayersProps['rideMarkers']
  rideGpsSamples: CenterMapLayersProps['rideGpsSamples']
  mediaAssets: CenterMapLayersProps['mediaAssets']
  mapZoom: CenterMapLayersProps['mapZoom']
  historyMetricGradientsEnabled: CenterMapLayersProps['historyMetricGradientsEnabled']
  historyMetricHotRanges: CenterMapLayersProps['historyMetricHotRanges']
  onSuppressNextMapPress: CenterMapLayersProps['onSuppressNextMapPress']
  onSelectMarker: CenterMapLayersProps['onSelectMarker']
  onOpenMedia: CenterMapLayersProps['onOpenMedia']
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

export function CenterMapLayers({
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
  activeNavigationTarget,
  selectedNavigationTarget,
  mapPoints,
  selectedMapPointId,
  hiddenMapPointKinds,
  onToggleMapPointSelection,
  onSuppressNextMapPress,
  onSelectMarker,
  onOpenMedia,
  onSelectLegalCountry,
}: CenterMapLayersProps) {
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
  const activeNavigationMapPointId =
    activeNavigationTarget?.type === 'mapPoint' ? activeNavigationTarget.point.id : null
  const showDirectionPoint =
    directionPoint != null && activeNavigationTarget?.type !== 'mapPoint' && !historyActive

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
      {showDirectionPoint && (
        <MapPin
          // Color in the key: PointAnnotation snapshots its children natively, so a
          // rider-color change must remount the pin to re-render.
          key={`center-direction-position-${directionColor}`}
          id="center-direction-position"
          coordinate={[directionPoint.longitude, directionPoint.latitude]}
          color={directionColor}
          icon={getMapPointKindIcon(directionPoint.kind)}
          iconColor={directionTextColor}
          selected
          navigationActive
        />
      )}
      {selectedNavigationTarget &&
      selectedNavigationTarget.type !== 'mapPoint' &&
      !historyActive ? (
        <PendingNavigationTargetPin
          key={`center-selected-navigation-target-${selectedNavigationTarget.id}`}
          coordinate={[selectedNavigationTarget.longitude, selectedNavigationTarget.latitude]}
          color={directionColor}
        />
      ) : null}
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
              selected={
                selectedMapPoint?.id === point.id || activeNavigationMapPointId === point.id
              }
              navigationActive={activeNavigationMapPointId === point.id}
              expandSelected={expandSelectedMapPoints && selectedMapPoint?.id === point.id}
              label={getMapPointKindLabel(point.kind)}
              onSelected={() => {
                onSuppressNextMapPress()
                onToggleMapPointSelection(point.id)
              }}
            />
          ))}
    </>
  )
}

const styles = StyleSheet.create({
  riderMarker: {
    alignItems: 'center',
    gap: 4,
  },
  riderDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  riderHeadingRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 32,
    height: 32,
    alignItems: 'center',
  },
  riderHeadingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  riderLabel: {
    maxWidth: 96,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    color: theme.palette.slate.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  riderLabelStale: {
    color: theme.palette.slate.textMuted,
  },
  pendingNavigationTarget: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.4),
  },
  pendingNavigationTargetCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})

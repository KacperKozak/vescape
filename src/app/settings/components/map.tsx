import Mapbox, { Camera, MapView } from '@rnmapbox/maps'
import { SlidersHorizontalIcon } from 'phosphor-react-native'
import { useCallback, useRef, useState, type ElementRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { MapPoint } from 'vesc-ble'

import { IconButton } from '@/components/ui/base/IconButton'
import { CornerSheet } from '@/components/ui/overlays/CornerSheet'
import { useTriggerRef } from '@/components/ui/overlays/measureTrigger'
import { ChipRow, ToggleRow, ValueRow } from '@/components/ui/dev/ShowcaseControls'
import { MapStyleSwitch } from '@/components/ui/controls/MapStyleSwitch'
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapy'
import { BLANK_STYLE, MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { theme } from '@/constants/theme'
import type { HistoryMetricKey } from '@/lib/history/metricColorScale'
import {
  FIXTURE_ACCURACY_FIX,
  FIXTURE_ACCURACY_SHAPE,
  FIXTURE_CAMERA_CENTER,
  FIXTURE_CAMERA_ZOOM,
  FIXTURE_DIRECTION_POINT,
  FIXTURE_GPS_PUCK_BEARING_DEG,
  FIXTURE_HISTORY_METRIC_HOT_RANGES,
  FIXTURE_LIVE_TRAIL_SHAPE,
  FIXTURE_MAP_POINTS,
  FIXTURE_MEDIA_ASSETS,
  FIXTURE_RIDE_GPS_SAMPLES,
  FIXTURE_RIDE_MARKERS,
  FIXTURE_RIDE_ROUTE,
  FIXTURE_RIDE_ROUTE_SHAPE,
  FIXTURE_RIDE_TELEMETRY_SAMPLES,
  FIXTURE_RIDERS,
} from '@/lib/map/mapShowcaseFixtures'
import { CenterMapLayers, HistoryMapLayers } from '@/screens/center/CenterMapLayers'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

const HISTORY_METRIC_OPTIONS: { key: HistoryMetricKey; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'duty', label: 'Duty' },
  { key: 'battery', label: 'Battery' },
  { key: 'tempMotor', label: 'Motor temp' },
  { key: 'tempController', label: 'Controller temp' },
  { key: 'motorCurrent', label: 'Motor current' },
  { key: 'batteryCurrent', label: 'Battery current' },
]

export default function MapComponentsShowcase() {
  const [styleKey, setStyleKey] = useState<MapStyleKey>('onedark')
  const [styleExpanded, setStyleExpanded] = useState(false)
  const [weatherActive, setWeatherActive] = useState(false)
  const [mapPoints, setMapPoints] = useState<MapPoint[]>(FIXTURE_MAP_POINTS)
  const [selectedMapPointId, setSelectedMapPointId] = useState<string | null>(null)
  const [activeHistoryMapMetric, setActiveHistoryMapMetric] = useState<HistoryMetricKey>('speed')
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)
  const cameraRef = useRef<ElementRef<typeof Camera>>(null)
  const moreTriggerRef = useTriggerRef()

  const handleMapLoaded = useCallback(() => {
    cameraRef.current?.setCamera({
      centerCoordinate: FIXTURE_CAMERA_CENTER,
      zoomLevel: FIXTURE_CAMERA_ZOOM,
      animationDuration: 0,
    })
  }, [])

  const selectedStyle = MAP_STYLES.find((s) => s.key === styleKey) ?? MAP_STYLES[0]
  const isMapy = selectedStyle.key === 'mapy'
  const isOneDark = selectedStyle.key === 'onedark'
  const useCustomJSON = isMapy || isOneDark
  const showBuildings3d = selectedStyle.key === 'outdoors' || selectedStyle.key === 'onedark'

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={useCustomJSON ? undefined : selectedStyle.styleURL}
        styleJSON={isOneDark ? ONE_DARK_MAP_STYLE : isMapy ? BLANK_STYLE : undefined}
        pitchEnabled={false}
        rotateEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        onDidFinishLoadingMap={handleMapLoaded}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: FIXTURE_CAMERA_CENTER,
            zoomLevel: FIXTURE_CAMERA_ZOOM,
          }}
          animationMode="none"
        />
        {/* historyActive=false renders buildings/raster/weather + live pins/GPS puck/riders */}
        <CenterMapLayers
          historyActive={false}
          expandSelectedMapPoints
          isMapy={isMapy}
          isOneDark={isOneDark}
          showBuildings3d={showBuildings3d}
          weatherActive={weatherActive}
          liveTrailShape={FIXTURE_LIVE_TRAIL_SHAPE}
          rideRouteShape={null}
          accuracyFix={FIXTURE_ACCURACY_FIX}
          accuracyShape={FIXTURE_ACCURACY_SHAPE}
          gpsPuckBearingDeg={FIXTURE_GPS_PUCK_BEARING_DEG}
          riders={FIXTURE_RIDERS}
          rideRoute={[]}
          rideTelemetrySamples={[]}
          activeHistoryMapMetric={activeHistoryMapMetric}
          rideMarkers={[]}
          rideGpsSamples={[]}
          mediaAssets={[]}
          mapZoom={FIXTURE_CAMERA_ZOOM}
          historyMetricGradientsEnabled
          historyMetricHotRanges={FIXTURE_HISTORY_METRIC_HOT_RANGES}
          directionPoint={FIXTURE_DIRECTION_POINT}
          mapPoints={mapPoints}
          selectedMapPointId={selectedMapPointId}
          hiddenMapPointKinds={[]}
          onClearDirectionPoint={() => {}}
          onToggleMapPointSelection={(id) =>
            setSelectedMapPointId((current) => (current === id ? null : id))
          }
          onRemoveMapPoint={(id) => setMapPoints((current) => current.filter((p) => p.id !== id))}
          onSuppressNextMapPress={() => {}}
          onSelectMarker={() => {}}
          onOpenMedia={() => {}}
        />
        {/* Rendered alongside the live layer (not behind historyActive) so the ride route,
            markers and media pins are always visible together with everything above. */}
        <HistoryMapLayers
          rideRouteShape={FIXTURE_RIDE_ROUTE_SHAPE}
          rideRoute={FIXTURE_RIDE_ROUTE}
          rideTelemetrySamples={FIXTURE_RIDE_TELEMETRY_SAMPLES}
          activeHistoryMapMetric={activeHistoryMapMetric}
          rideMarkers={FIXTURE_RIDE_MARKERS}
          rideGpsSamples={FIXTURE_RIDE_GPS_SAMPLES}
          mediaAssets={FIXTURE_MEDIA_ASSETS}
          mapZoom={FIXTURE_CAMERA_ZOOM}
          historyMetricGradientsEnabled
          historyMetricHotRanges={FIXTURE_HISTORY_METRIC_HOT_RANGES}
          onSuppressNextMapPress={() => {}}
          onSelectMarker={(selection) => setLastEvent(`Marker: ${selection.marker.type}`)}
          onOpenMedia={(asset) => setLastEvent(`Media: ${asset.filename}`)}
        />
      </MapView>

      <View style={styles.topRight} pointerEvents="box-none">
        <MapStyleSwitch
          activeKey={styleKey}
          expanded={styleExpanded}
          onToggle={() => setStyleExpanded((v) => !v)}
          onSelect={(key) => {
            setStyleKey(key)
            setStyleExpanded(false)
          }}
        />
        <View ref={moreTriggerRef} collapsable={false}>
          <IconButton
            icon={SlidersHorizontalIcon}
            size="md"
            onPress={() => setSheetVisible(true)}
            style={styles.floatingButton}
          />
        </View>
      </View>

      <CornerSheet
        visible={sheetVisible}
        triggerRef={moreTriggerRef}
        anchor="right"
        title="Map options"
        onClose={() => setSheetVisible(false)}
      >
        <ToggleRow label="Weather radar" value={weatherActive} onToggle={setWeatherActive} />
        <ChipRow
          label="Route metric"
          options={HISTORY_METRIC_OPTIONS.map((m) => m.label)}
          selected={
            HISTORY_METRIC_OPTIONS.find((m) => m.key === activeHistoryMapMetric)?.label ?? 'Speed'
          }
          onSelect={(label) => {
            const match = HISTORY_METRIC_OPTIONS.find((m) => m.label === label)
            if (match) setActiveHistoryMapMetric(match.key)
          }}
        />
        <ValueRow label="Last interaction" value={lastEvent ?? '—'} />
        <Text style={styles.hint}>
          Tap a pin to expand its label + delete button. Buildings 3D follows the style (Outdoors,
          One Dark).
        </Text>
      </CornerSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  topRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    alignItems: 'flex-end',
    gap: 8,
  },
  floatingButton: {
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  },
  hint: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
})

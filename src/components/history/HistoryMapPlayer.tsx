import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Mapbox, { Camera, LineLayer, ShapeSource, type Camera as CameraRef } from '@rnmapbox/maps'
import {
  CaretLeftIcon,
  CaretRightIcon,
  ListBulletsIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from 'phosphor-react-native'

import {
  clampHeadTime,
  downsampleTimeSeries,
  findNearestSampleIndexByTime,
  stepHeadTime,
} from '@/history/playback'
import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart'
import { computeAutoRange, type TelemetryChartPoint } from '@/components/charts/chartMath'
import { dutyPercent, fmtDutyPercent } from '@/helpers/format'
import {
  getVisibleChartMetrics,
  OPTIONAL_CHART_METRICS,
  toggleOptionalChartMetric,
  type OptionalChartMetric,
} from '@/components/history/historyChartMetrics'
import type {
  HistoryGpsSample,
  HistoryMarker,
  HistorySession,
  TelemetrySample,
} from '@/store/historyStore'
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapy'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { MAP_DEFAULTS } from '@/constants/mapStyles'
import { getBounds } from '@/helpers/mapGeometry'
import { MapPin } from '@/components/map/MapPin'
import { HistorySessionSheet } from './HistorySessionSheet'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

const STEP_MS = 5_000
const SESSION_SAMPLE_LIMIT = 10_000
const CHART_MAX_POINTS = 220
const OPTIONAL_CHART_TAB_COUNT = OPTIONAL_CHART_METRICS.length

type MarkerPoint = {
  id: string
  latitude: number
  longitude: number
  type: 'error' | 'disconnected' | 'app_stop'
}

interface HistoryMapPlayerProps {
  sessions: HistorySession[]
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
  sessionGpsSamples: HistoryGpsSample[]
  sessionMarkers: HistoryMarker[]
  loadingSession: boolean
  sessionTruncated: boolean
  onSelectSession: (session: HistorySession | null) => Promise<void>
}

export function HistoryMapPlayer({
  sessions,
  selectedSession,
  sessionSamples,
  sessionGpsSamples,
  sessionMarkers,
  loadingSession,
  sessionTruncated,
  onSelectSession,
}: HistoryMapPlayerProps) {
  const [sheetVisible, setSheetVisible] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [headTimeMs, setHeadTimeMs] = useState<number | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [activeCharts, setActiveCharts] = useState<Set<OptionalChartMetric>>(new Set())
  const playbackStartRef = useRef<{ realMs: number; headMs: number } | null>(null)
  const cameraRef = useRef<CameraRef>(null)

  const routeByTime = useMemo(
    () => [...sessionGpsSamples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [sessionGpsSamples],
  )

  const route = useMemo<[number, number][]>(
    () => routeByTime.map((point) => [point.longitude, point.latitude] as [number, number]),
    [routeByTime],
  )
  const routeShape = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(
    () =>
      route.length > 1
        ? {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: route },
            properties: {},
          }
        : null,
    [route],
  )
  const boardByTime = useMemo(
    () => [...sessionSamples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [sessionSamples],
  )

  const chartSamples = useMemo(
    () => downsampleTimeSeries(boardByTime, CHART_MAX_POINTS, (sample) => sample.capturedAtMs),
    [boardByTime],
  )

  const speedPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        date: new Date(sample.capturedAtMs),
        value: sample.speedKmh,
      })),
    [chartSamples],
  )

  const dutyPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        date: new Date(sample.capturedAtMs),
        value: dutyPercent(sample.dutyCycle, false),
      })),
    [chartSamples],
  )

  const batteryVoltagePoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryVoltage })),
    [chartSamples],
  )
  const tempMotorPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples
        .filter((s) => s.tempMotor != null)
        .map((s) => ({ date: new Date(s.capturedAtMs), value: s.tempMotor! })),
    [chartSamples],
  )
  const tempMosfetPoints = useMemo<TelemetryChartPoint[]>(
    () =>
      chartSamples
        .filter((s) => s.tempMosfet != null)
        .map((s) => ({ date: new Date(s.capturedAtMs), value: s.tempMosfet! })),
    [chartSamples],
  )
  const motorCurrentPoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.motorCurrent })),
    [chartSamples],
  )
  const batteryCurrentPoints = useMemo<TelemetryChartPoint[]>(
    () => chartSamples.map((s) => ({ date: new Date(s.capturedAtMs), value: s.batteryCurrent })),
    [chartSamples],
  )

  const batteryRange = useMemo(
    () =>
      computeAutoRange(batteryVoltagePoints, {
        includeZero: false,
        minSpan: 5,
        paddingRatio: 0.1,
        fallbackMin: 30,
        fallbackMax: 60,
      }),
    [batteryVoltagePoints],
  )
  const tempMotorRange = useMemo(
    () =>
      computeAutoRange(tempMotorPoints, {
        includeZero: false,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: 0,
        fallbackMax: 100,
      }),
    [tempMotorPoints],
  )
  const tempMosfetRange = useMemo(
    () =>
      computeAutoRange(tempMosfetPoints, {
        includeZero: false,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: 0,
        fallbackMax: 100,
      }),
    [tempMosfetPoints],
  )
  const motorCurrentRange = useMemo(
    () =>
      computeAutoRange(motorCurrentPoints, {
        includeZero: true,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: -50,
        fallbackMax: 50,
      }),
    [motorCurrentPoints],
  )
  const batteryCurrentRange = useMemo(
    () =>
      computeAutoRange(batteryCurrentPoints, {
        includeZero: true,
        minSpan: 20,
        paddingRatio: 0.1,
        fallbackMin: -30,
        fallbackMax: 30,
      }),
    [batteryCurrentPoints],
  )

  useEffect(() => {
    if (!selectedSession && sessions.length > 0) {
      void onSelectSession(sessions[0])
    }
  }, [onSelectSession, selectedSession, sessions])

  useEffect(() => {
    if (!selectedSession) {
      setHeadTimeMs(null)
      setPlaying(false)
      playbackStartRef.current = null
      return
    }
    setPlaying(false)
    playbackStartRef.current = null
    setHeadTimeMs(selectedSession.startAtMs)
  }, [selectedSession])

  useEffect(() => {
    if (!mapReady || !selectedSession || route.length < 2) return
    const fit = () => {
      const bounds = getBounds(route)
      cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [80, 40, 80, 40], 700)
    }
    const frame = requestAnimationFrame(fit)
    const timer = setTimeout(fit, 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [mapReady, route, selectedSession, activeCharts.size])

  useEffect(() => {
    if (!playing || !selectedSession || headTimeMs == null) return
    playbackStartRef.current = { realMs: Date.now(), headMs: headTimeMs }
    const interval = setInterval(() => {
      const start = playbackStartRef.current
      if (!start) return
      const next = clampHeadTime(
        start.headMs + (Date.now() - start.realMs),
        selectedSession.startAtMs,
        selectedSession.endAtMs,
      )
      setHeadTimeMs(next)
      if (next >= selectedSession.endAtMs) {
        setPlaying(false)
        playbackStartRef.current = null
      }
    }, 250)
    return () => clearInterval(interval)
  }, [headTimeMs, playing, selectedSession])

  useEffect(() => {
    return () => {
      setPlaying(false)
      playbackStartRef.current = null
    }
  }, [])

  const currentGps = useMemo(() => {
    if (headTimeMs == null || routeByTime.length === 0) return null
    const idx = findNearestSampleIndexByTime(routeByTime, headTimeMs)
    return idx >= 0 ? routeByTime[idx] : null
  }, [headTimeMs, routeByTime])

  const currentBoard = useMemo(() => {
    if (headTimeMs == null || boardByTime.length === 0) return null
    const idx = findNearestSampleIndexByTime(boardByTime, headTimeMs)
    return idx >= 0 ? boardByTime[idx] : null
  }, [boardByTime, headTimeMs])

  const markerPoints = useMemo<MarkerPoint[]>(() => {
    const points: MarkerPoint[] = []
    for (const marker of sessionMarkers) {
      if (marker.type !== 'error' && marker.type !== 'disconnected' && marker.type !== 'app_stop') {
        continue
      }
      const idx = findNearestSampleIndexByTime(routeByTime, marker.occurredAtMs)
      if (idx < 0) continue
      const gps = routeByTime[idx]
      points.push({
        id: String(marker.id),
        latitude: gps.latitude,
        longitude: gps.longitude,
        type: marker.type,
      })
    }
    return points
  }, [routeByTime, sessionMarkers])

  const selectedIndex = useMemo(() => {
    if (!selectedSession) return -1
    return sessions.findIndex((s) => s.id === selectedSession.id)
  }, [selectedSession, sessions])

  const speedRange = useMemo(
    () =>
      computeAutoRange(speedPoints, {
        includeZero: true,
        minSpan: 10,
        paddingRatio: 0.1,
        fallbackMin: -5,
        fallbackMax: 5,
      }),
    [speedPoints],
  )
  const currentChartSample = useMemo(() => {
    if (headTimeMs == null || chartSamples.length === 0) return null
    const idx = findNearestSampleIndexByTime(chartSamples, headTimeMs)
    return idx >= 0 ? chartSamples[idx] : null
  }, [chartSamples, headTimeMs])
  const optionalChartConfigs = useMemo(
    () => [
      {
        key: 'duty' as const,
        label: 'Duty Cycle',
        value: currentBoard ? fmtDutyPercent(currentBoard.dutyCycle, false) : '-',
        points: dutyPoints,
        color: '#34d399',
        range: { y: { min: -100, max: 100 } },
        currentPoint: currentChartSample
          ? {
              date: new Date(currentChartSample.capturedAtMs),
              value: dutyPercent(currentChartSample.dutyCycle, false),
            }
          : null,
        formatValue: (value: number) => `${value.toFixed(0)}%`,
      },
      {
        key: 'battery' as const,
        label: 'Battery Voltage',
        value: currentBoard ? `${currentBoard.batteryVoltage.toFixed(1)} V` : '-',
        points: batteryVoltagePoints,
        color: '#fbbf24',
        range: batteryRange,
        currentPoint: currentChartSample
          ? {
              date: new Date(currentChartSample.capturedAtMs),
              value: currentChartSample.batteryVoltage,
            }
          : null,
        formatValue: (value: number) => `${value.toFixed(1)} V`,
      },
      {
        key: 'tempMotor' as const,
        label: 'Motor Temp',
        value: currentBoard?.tempMotor != null ? `${currentBoard.tempMotor.toFixed(1)} C` : '-',
        points: tempMotorPoints,
        color: '#f97316',
        range: tempMotorRange,
        currentPoint:
          currentChartSample?.tempMotor != null
            ? {
                date: new Date(currentChartSample.capturedAtMs),
                value: currentChartSample.tempMotor,
              }
            : null,
        formatValue: (value: number) => `${value.toFixed(1)} C`,
      },
      {
        key: 'tempController' as const,
        label: 'Controller Temp',
        value: currentBoard?.tempMosfet != null ? `${currentBoard.tempMosfet.toFixed(1)} C` : '-',
        points: tempMosfetPoints,
        color: '#ef4444',
        range: tempMosfetRange,
        currentPoint:
          currentChartSample?.tempMosfet != null
            ? {
                date: new Date(currentChartSample.capturedAtMs),
                value: currentChartSample.tempMosfet,
              }
            : null,
        formatValue: (value: number) => `${value.toFixed(1)} C`,
      },
      {
        key: 'motorCurrent' as const,
        label: 'Motor Current',
        value: currentBoard ? `${currentBoard.motorCurrent.toFixed(1)} A` : '-',
        points: motorCurrentPoints,
        color: '#22c55e',
        range: motorCurrentRange,
        currentPoint: currentChartSample
          ? {
              date: new Date(currentChartSample.capturedAtMs),
              value: currentChartSample.motorCurrent,
            }
          : null,
        formatValue: (value: number) => `${value.toFixed(1)} A`,
      },
      {
        key: 'batteryCurrent' as const,
        label: 'Batt Current',
        value: currentBoard ? `${currentBoard.batteryCurrent.toFixed(1)} A` : '-',
        points: batteryCurrentPoints,
        color: '#38bdf8',
        range: batteryCurrentRange,
        currentPoint: currentChartSample
          ? {
              date: new Date(currentChartSample.capturedAtMs),
              value: currentChartSample.batteryCurrent,
            }
          : null,
        formatValue: (value: number) => `${value.toFixed(1)} A`,
      },
    ],
    [
      batteryCurrentPoints,
      batteryCurrentRange,
      batteryRange,
      batteryVoltagePoints,
      currentBoard,
      currentChartSample,
      dutyPoints,
      motorCurrentPoints,
      motorCurrentRange,
      tempMosfetPoints,
      tempMosfetRange,
      tempMotorPoints,
      tempMotorRange,
    ],
  )
  const visibleOptionalCharts = useMemo(() => {
    const visible = new Set(getVisibleChartMetrics(activeCharts))
    return optionalChartConfigs.filter((chart) => visible.has(chart.key))
  }, [activeCharts, optionalChartConfigs])
  const canMovePrevSession = selectedIndex >= 0 && selectedIndex < sessions.length - 1
  const canMoveNextSession = selectedIndex > 0
  const canMoveHead = !!selectedSession && headTimeMs != null
  const canRenderCharts = boardByTime.length >= 2

  const stopPlayback = () => {
    setPlaying(false)
    playbackStartRef.current = null
  }

  const togglePlay = () => {
    if (!selectedSession || headTimeMs == null) return
    setPlaying((prev) => !prev)
  }

  const moveSession = (direction: -1 | 1) => {
    if (selectedIndex < 0) return
    const nextIndex = selectedIndex - direction
    const next = sessions[nextIndex]
    if (!next) return
    stopPlayback()
    void onSelectSession(next)
  }

  const stepHead = (direction: -1 | 1) => {
    if (!selectedSession || headTimeMs == null) return
    stopPlayback()
    setHeadTimeMs(
      stepHeadTime(
        headTimeMs,
        direction,
        STEP_MS,
        selectedSession.startAtMs,
        selectedSession.endAtMs,
      ),
    )
  }

  const onMapPress = (latitude: number, longitude: number) => {
    if (!routeByTime.length) return
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let i = 0; i < routeByTime.length; i += 1) {
      const p = routeByTime[i]
      const dLat = p.latitude - latitude
      const dLon = p.longitude - longitude
      const d = dLat * dLat + dLon * dLon
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    stopPlayback()
    setHeadTimeMs(routeByTime[best].capturedAtMs)
  }

  const selectChartPoint = (point: { date: Date }) => {
    if (!selectedSession) return
    stopPlayback()
    setHeadTimeMs(
      clampHeadTime(point.date.getTime(), selectedSession.startAtMs, selectedSession.endAtMs),
    )
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleJSON={ONE_DARK_MAP_STYLE}
        onDidFinishLoadingMap={() => setMapReady(true)}
        compassEnabled={false}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        onPress={(feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          onMapPress(latitude, longitude)
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: route[0] ?? MAP_DEFAULTS.fallbackCoordinate,
            zoomLevel: route.length > 0 ? 14 : 11,
          }}
          maxZoomLevel={19}
        />
        {routeShape && (
          <ShapeSource id="history-route-source" shape={routeShape}>
            <LineLayer
              id="history-route-line"
              style={{
                lineColor: '#a855f7',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}
        {currentGps && (
          <MapPin
            id="history-current"
            coordinate={[currentGps.longitude, currentGps.latitude]}
            color="#ef4444"
          />
        )}
        {markerPoints.map((point) => (
          <MapPin
            key={point.id}
            id={`history-marker-${point.id}`}
            coordinate={[point.longitude, point.latitude]}
            color={point.type === 'error' ? '#ef4444' : '#f59e0b'}
          />
        ))}
      </Mapbox.MapView>

      {!selectedSession && !loadingSession && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyTitle}>
            {sessions.length ? 'Select a session' : 'No rides yet'}
          </Text>
          <Text style={styles.emptyText}>Open Rides list to start playback.</Text>
        </View>
      )}

      {selectedSession && route.length === 0 && !loadingSession && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyTitle}>No GPS points in this session</Text>
          <Text style={styles.emptyText}>Playback stats still work, map route not available.</Text>
        </View>
      )}

      {loadingSession && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#60a5fa" />
          <Text style={styles.loadingText}>Loading session…</Text>
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.controlsTop}>
          <Pressable style={styles.ridesButton} onPress={() => setSheetVisible(true)}>
            <ListBulletsIcon size={16} color="#e2e8f0" weight="bold" />
            <Text style={styles.ridesButtonText}>Rides</Text>
          </Pressable>
          {selectedSession && (
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {new Date(selectedSession.startAtMs).toLocaleString()} · {selectedSession.deviceName}
            </Text>
          )}
        </View>

        {canRenderCharts ? (
          <View style={styles.chartStack}>
            <TelemetryLineChart
              label="Speed"
              value={currentBoard ? `${currentBoard.speedKmh.toFixed(1)} km/h` : '-'}
              points={speedPoints}
              color="#60a5fa"
              range={speedRange}
              currentPoint={
                currentChartSample
                  ? {
                      date: new Date(currentChartSample.capturedAtMs),
                      value: currentChartSample.speedKmh,
                    }
                  : null
              }
              onPointSelected={selectChartPoint}
              onGestureStart={stopPlayback}
              height={54}
              containerStyle={styles.speedChart}
            />
            {visibleOptionalCharts.map((chart) => (
              <TelemetryLineChart
                key={chart.key}
                label={chart.label}
                value={chart.value}
                points={chart.points}
                color={chart.color}
                range={chart.range}
                currentPoint={chart.currentPoint}
                onPointSelected={selectChartPoint}
                onGestureStart={stopPlayback}
                height={54}
                containerStyle={styles.optionalChart}
                formatValue={chart.formatValue}
              />
            ))}
            <View style={styles.metricTabs}>
              {OPTIONAL_CHART_METRICS.map((metric, index) => {
                const active = activeCharts.has(metric.key)
                return (
                  <Pressable
                    key={metric.key}
                    style={[
                      styles.metricTab,
                      index < OPTIONAL_CHART_METRICS.length - 1 && styles.metricTabDivider,
                      active && styles.metricTabActive,
                    ]}
                    onPress={() =>
                      setActiveCharts((prev) => toggleOptionalChartMetric(prev, metric.key))
                    }
                  >
                    {metric.multilineLabel ? (
                      <View style={styles.metricTabTextStack}>
                        <Text
                          style={[styles.metricTabText, active && styles.metricTabTextActive]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {metric.multilineLabel[0]}
                        </Text>
                        <Text
                          style={[styles.metricTabText, active && styles.metricTabTextActive]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {metric.multilineLabel[1]}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[styles.metricTabText, active && styles.metricTabTextActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {metric.label}
                      </Text>
                    )}
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : (
          <Text style={styles.chartEmpty}>No board samples for charts.</Text>
        )}

        <View style={styles.tapeRow}>
          <Pressable
            style={[styles.tapeButton, !canMovePrevSession && styles.tapeButtonDisabled]}
            disabled={!canMovePrevSession}
            onPress={() => moveSession(-1)}
          >
            <SkipBackIcon size={18} color="#f8fafc" weight="fill" />
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveHead && styles.tapeButtonDisabled]}
            disabled={!canMoveHead}
            onPress={() => stepHead(-1)}
          >
            <CaretLeftIcon size={18} color="#f8fafc" weight="fill" />
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveHead && styles.tapeButtonDisabled]}
            disabled={!canMoveHead}
            onPress={togglePlay}
          >
            {playing ? (
              <PauseIcon size={16} color="#f8fafc" weight="fill" />
            ) : (
              <PlayIcon size={16} color="#f8fafc" weight="fill" />
            )}
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveHead && styles.tapeButtonDisabled]}
            disabled={!canMoveHead}
            onPress={() => stepHead(1)}
          >
            <CaretRightIcon size={18} color="#f8fafc" weight="fill" />
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveNextSession && styles.tapeButtonDisabled]}
            disabled={!canMoveNextSession}
            onPress={() => moveSession(1)}
          >
            <SkipForwardIcon size={18} color="#f8fafc" weight="fill" />
          </Pressable>
        </View>

        {sessionTruncated && (
          <Text style={styles.truncatedText}>
            Session truncated ({'>='} {SESSION_SAMPLE_LIMIT.toLocaleString()} samples loaded).
          </Text>
        )}
      </View>

      <HistorySessionSheet
        visible={sheetVisible}
        sessions={sessions}
        selectedSessionId={selectedSession?.id ?? null}
        onClose={() => setSheetVisible(false)}
        onSelectSession={(session) => {
          setSheetVisible(false)
          stopPlayback()
          void onSelectSession(session)
        }}
      />
    </View>
  )
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  emptyOverlay: {
    position: 'absolute',
    top: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 92,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  loadingText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '600',
  },
  controls: {
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    padding: 10,
    gap: 8,
  },
  controlsTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ridesButton: {
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ridesButtonText: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 12,
  },
  sessionTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    flex: 1,
  },
  chartStack: {
    gap: 8,
  },
  speedChart: {
    minHeight: 86,
  },
  optionalChart: {
    minHeight: 76,
  },
  metricTabs: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  metricTab: {
    width: `${100 / OPTIONAL_CHART_TAB_COUNT}%`,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  metricTabDivider: {
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  metricTabActive: {
    backgroundColor: '#172554',
  },
  metricTabTextStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  metricTabText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
    lineHeight: 12,
  },
  metricTabTextActive: {
    color: '#dbeafe',
  },
  chartEmpty: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tapeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tapeButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  tapeButtonDisabled: {
    opacity: 0.45,
  },
  truncatedText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
})

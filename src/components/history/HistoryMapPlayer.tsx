import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { LineGraph } from 'react-native-graph'
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps'
import { ListBullets, Pause, Play } from 'phosphor-react-native'

import {
  clampHeadTime,
  downsampleTimeSeries,
  findNearestSampleIndexByTime,
  stepHeadTime,
} from '@/history/playback'
import type {
  HistoryGpsSample,
  HistoryMarker,
  HistorySession,
  TelemetrySample,
} from '@/store/historyStore'
import { HistorySessionSheet } from './HistorySessionSheet'

const STEP_MS = 5_000
const SESSION_SAMPLE_LIMIT = 10_000
const CHART_MAX_POINTS = 220

type MarkerPoint = {
  id: string
  latitude: number
  longitude: number
  type: 'error' | 'disconnected' | 'app_stop'
}

type HistoryChartKind = 'speed' | 'duty'

interface HistoryChartPoint {
  date: Date
  value: number
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
  const playbackStartRef = useRef<{ realMs: number; headMs: number } | null>(null)
  const mapRef = useRef<MapView>(null)

  const route = useMemo<LatLng[]>(
    () =>
      sessionGpsSamples.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    [sessionGpsSamples],
  )

  const routeByTime = useMemo(
    () => [...sessionGpsSamples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [sessionGpsSamples],
  )
  const boardByTime = useMemo(
    () => [...sessionSamples].sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    [sessionSamples],
  )

  const chartSamples = useMemo(
    () => downsampleTimeSeries(boardByTime, CHART_MAX_POINTS, (sample) => sample.capturedAtMs),
    [boardByTime],
  )

  const speedPoints = useMemo<HistoryChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        date: new Date(sample.capturedAtMs),
        value: sample.speedKmh,
      })),
    [chartSamples],
  )

  const dutyPoints = useMemo<HistoryChartPoint[]>(
    () =>
      chartSamples.map((sample) => ({
        date: new Date(sample.capturedAtMs),
        value: sample.dutyCycle * 100,
      })),
    [chartSamples],
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
    if (!selectedSession || route.length < 2) return
    mapRef.current?.fitToCoordinates(route, {
      edgePadding: { top: 80, right: 40, bottom: 360, left: 40 },
      animated: true,
    })
  }, [route, selectedSession])

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

  const speedRange = useMemo(() => computeSpeedRange(speedPoints), [speedPoints])
  const compactStats = useMemo(
    () => [
      { label: 'Time', value: headTimeMs != null ? formatTime(headTimeMs) : '-' },
      {
        label: 'GPS',
        value: currentGps?.speedMps != null ? `${(currentGps.speedMps * 3.6).toFixed(1)}` : '-',
      },
      { label: 'Board', value: currentBoard ? `${currentBoard.speedKmh.toFixed(1)}` : '-' },
      {
        label: 'Duty',
        value: currentBoard ? `${(currentBoard.dutyCycle * 100).toFixed(0)}%` : '-',
      },
      { label: 'Volt', value: currentBoard ? `${currentBoard.batteryVoltage.toFixed(1)}V` : '-' },
      {
        label: 'State',
        value: currentBoard
          ? currentBoard.hasFault
            ? `F${currentBoard.faultCode}`
            : String(currentBoard.state)
          : '-',
      },
    ],
    [currentBoard, currentGps, headTimeMs],
  )

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
      <MapView
        ref={mapRef}
        style={styles.map}
        onPress={(e) =>
          onMapPress(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
        }
      >
        {route.length > 1 && <Polyline coordinates={route} strokeWidth={4} strokeColor="#38bdf8" />}
        {currentGps && (
          <Marker
            coordinate={{ latitude: currentGps.latitude, longitude: currentGps.longitude }}
            pinColor="#22c55e"
          />
        )}
        {markerPoints.map((point) => (
          <Marker
            key={point.id}
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            pinColor={point.type === 'error' ? '#ef4444' : '#f59e0b'}
          />
        ))}
      </MapView>

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
            <ListBullets size={16} color="#e2e8f0" weight="bold" />
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
            <HistoryLineChart
              kind="speed"
              label="Speed"
              value={currentBoard ? `${currentBoard.speedKmh.toFixed(1)} km/h` : '-'}
              points={speedPoints}
              color="#60a5fa"
              range={speedRange}
              onPointSelected={selectChartPoint}
              onGestureStart={stopPlayback}
            />
            <HistoryLineChart
              kind="duty"
              label="Duty"
              value={currentBoard ? `${(currentBoard.dutyCycle * 100).toFixed(0)}%` : '-'}
              points={dutyPoints}
              color="#34d399"
              range={{ y: { min: -100, max: 100 } }}
              onPointSelected={selectChartPoint}
              onGestureStart={stopPlayback}
            />
          </View>
        ) : (
          <Text style={styles.chartEmpty}>No board samples for charts.</Text>
        )}

        <View style={styles.compactStats}>
          {compactStats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </View>

        <View style={styles.tapeRow}>
          <Pressable
            style={[styles.tapeButton, !canMovePrevSession && styles.tapeButtonDisabled]}
            disabled={!canMovePrevSession}
            onPress={() => moveSession(-1)}
          >
            <Text style={styles.tapeText}>{'<<<'}</Text>
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveHead && styles.tapeButtonDisabled]}
            disabled={!canMoveHead}
            onPress={() => stepHead(-1)}
          >
            <Text style={styles.tapeText}>{'<'}</Text>
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveHead && styles.tapeButtonDisabled]}
            disabled={!canMoveHead}
            onPress={togglePlay}
          >
            {playing ? (
              <Pause size={16} color="#f8fafc" weight="fill" />
            ) : (
              <Play size={16} color="#f8fafc" weight="fill" />
            )}
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveHead && styles.tapeButtonDisabled]}
            disabled={!canMoveHead}
            onPress={() => stepHead(1)}
          >
            <Text style={styles.tapeText}>{'>'}</Text>
          </Pressable>
          <Pressable
            style={[styles.tapeButton, !canMoveNextSession && styles.tapeButtonDisabled]}
            disabled={!canMoveNextSession}
            onPress={() => moveSession(1)}
          >
            <Text style={styles.tapeText}>{'>>>'}</Text>
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

function computeSpeedRange(points: HistoryChartPoint[]): { y: { min: number; max: number } } {
  if (!points.length) return { y: { min: -5, max: 5 } }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const point of points) {
    min = Math.min(min, point.value)
    max = Math.max(max, point.value)
  }
  if (min > 0) min = 0
  if (max < 0) max = 0
  const span = Math.max(10, max - min)
  const pad = span * 0.1
  return { y: { min: min - pad, max: max + pad } }
}

function HistoryLineChart({
  kind,
  label,
  value,
  points,
  color,
  range,
  onPointSelected,
  onGestureStart,
}: {
  kind: HistoryChartKind
  label: string
  value: string
  points: HistoryChartPoint[]
  color: string
  range: { y: { min: number; max: number } }
  onPointSelected: (point: HistoryChartPoint) => void
  onGestureStart: () => void
}) {
  return (
    <View style={[styles.chartCard, kind === 'speed' ? styles.speedChart : styles.dutyChart]}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={styles.chartValue}>{value}</Text>
      </View>
      <LineGraph
        style={styles.graph}
        points={points}
        color={color}
        lineThickness={2}
        animated
        enablePanGesture
        panGestureDelay={0}
        range={range}
        onPointSelected={onPointSelected}
        onGestureStart={onGestureStart}
        onGestureEnd={() => {}}
      />
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
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
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15,23,42,0.95)',
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
  chartCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  speedChart: {
    minHeight: 86,
  },
  dutyChart: {
    minHeight: 76,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  chartValue: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  graph: {
    height: 54,
    marginTop: 4,
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
  compactStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statCell: {
    width: '32%',
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: '#111827',
    justifyContent: 'center',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
  },
  statValue: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
  tapeText: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '800',
  },
  truncatedText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
})

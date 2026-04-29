import { useCallback, useEffect } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Database, Trash, WarningCircle } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import {
  useHistoryStore,
  type HistoryGpsSample,
  type TelemetryHistoryBlock,
  type TelemetrySample,
} from '@/store/historyStore'

export function HistoryScreen() {
  const {
    blocks,
    liveBlocks,
    selectedBlock,
    samples,
    gpsSamples,
    liveSamples,
    liveGpsSamples,
    summary,
    loading,
    loadingSamples,
    error,
    hasMore,
    loadInitial,
    loadMore,
    refreshLive,
    selectBlock,
    clearHistory,
  } = useHistoryStore(
    useShallow((s) => ({
      blocks: s.blocks,
      liveBlocks: s.liveBlocks,
      selectedBlock: s.selectedBlock,
      samples: s.samples,
      gpsSamples: s.gpsSamples,
      liveSamples: s.liveSamples,
      liveGpsSamples: s.liveGpsSamples,
      summary: s.summary,
      loading: s.loading,
      loadingSamples: s.loadingSamples,
      error: s.error,
      hasMore: s.hasMore,
      loadInitial: s.loadInitial,
      loadMore: s.loadMore,
      refreshLive: s.refreshLive,
      selectBlock: s.selectBlock,
      clearHistory: s.clearHistory,
    })),
  )

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    void refreshLive()
    const interval = setInterval(() => {
      void refreshLive()
    }, 500)
    return () => clearInterval(interval)
  }, [refreshLive])

  const confirmClear = useCallback(() => {
    Alert.alert('Clear History', 'Remove all stored telemetry history from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => void clearHistory() },
    ])
  }, [clearHistory])

  const totalPoints = (summary?.sampleCount ?? 0) + (summary?.gpsPointCount ?? 0)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>
            {totalPoints
              ? `${totalPoints.toLocaleString()} points since ${formatDate(summary?.firstAtMs)}`
              : 'No history recorded yet'}
          </Text>
        </View>
        <Pressable
          style={[styles.iconButton, !totalPoints && styles.iconButtonDisabled]}
          disabled={!totalPoints}
          onPress={confirmClear}
        >
          <Trash size={18} color={totalPoints ? '#f87171' : '#4b5563'} weight="bold" />
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBar}>
          <WarningCircle size={18} color="#fca5a5" weight="bold" />
          <Text style={styles.errorText} selectable>
            {error}
          </Text>
        </View>
      )}

      <LiveCollectionCard
        summary={summary}
        blocks={liveBlocks}
        boardSamples={liveSamples}
        gpsSamples={liveGpsSamples}
      />

      <FlatList
        data={blocks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={blocks.length ? styles.list : styles.emptyList}
        refreshControl={
          <RefreshControl
            refreshing={loading && blocks.length === 0}
            onRefresh={() => void loadInitial()}
            tintColor="#f9fafb"
          />
        }
        onEndReached={() => {
          if (hasMore) void loadMore()
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#3b82f6" />
          ) : (
            <View style={styles.emptyState}>
              <Database size={28} color="#4b5563" weight="regular" />
              <Text style={styles.emptyTitle}>No telemetry recorded yet</Text>
              <Text style={styles.emptyText}>
                Connect to a board and ride data will appear here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && blocks.length > 0 ? (
            <ActivityIndicator style={styles.footerLoader} color="#3b82f6" />
          ) : null
        }
        renderItem={({ item, index }) => (
          <HistoryBlock
            block={item}
            previous={blocks[index - 1]}
            selected={selectedBlock?.id === item.id}
            samples={selectedBlock?.id === item.id ? samples : []}
            gpsSamples={selectedBlock?.id === item.id ? gpsSamples : []}
            loadingSamples={selectedBlock?.id === item.id && loadingSamples}
            onPress={() => void selectBlock(selectedBlock?.id === item.id ? null : item)}
          />
        )}
      />
    </View>
  )
}

function LiveCollectionCard({
  summary,
  blocks,
  boardSamples,
  gpsSamples,
}: {
  summary: { sampleCount: number; gpsPointCount: number; lastAtMs: number | null } | null
  blocks: TelemetryHistoryBlock[]
  boardSamples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
}) {
  const lastAt = summary?.lastAtMs ?? null
  const ageMs = lastAt ? Date.now() - lastAt : null
  const active = ageMs != null && ageMs < 15_000
  const boardCount = boardSamples.length
  const gpsCount = gpsSamples.length
  const latestBlock = blocks[0]
  const latestSpeed = latestBlock
    ? latestBlock.maxAbsSpeedKmh || latestBlock.maxGpsSpeedKmh || 0
    : 0
  const maxBucketPoints = Math.max(1, ...blocks.map((b) => b.sampleCount + b.gpsPointCount))

  return (
    <View style={styles.liveCard}>
      <View style={styles.liveTop}>
        <View style={styles.liveTitleRow}>
          <View style={[styles.liveDot, active && styles.liveDotActive]} />
          <Text style={styles.liveTitle}>{active ? 'Collecting now' : 'Latest window'}</Text>
        </View>
        <Text style={styles.liveAge}>
          {ageMs == null ? '-' : `${Math.max(0, Math.round(ageMs / 1000))}s ago`}
        </Text>
      </View>
      <View style={styles.liveBars}>
        {blocks.length ? (
          blocks
            .slice()
            .reverse()
            .map((block) => {
              const points = block.sampleCount + block.gpsPointCount
              return (
                <View key={block.id} style={styles.liveBarWrap}>
                  <View
                    style={[
                      styles.liveBar,
                      {
                        height: Math.max(5, Math.round((points / maxBucketPoints) * 34)),
                      },
                    ]}
                  />
                </View>
              )
            })
        ) : (
          <View style={styles.liveEmptyBar} />
        )}
      </View>
      <Text style={styles.liveBarsLabel}>Last 10 minutes, saved points per minute</Text>
      <View style={styles.metricsRow}>
        <Metric label="10 min board" value={String(boardCount)} />
        <Metric label="10 min GPS" value={String(gpsCount)} />
        <Metric label="Top speed" value={`${latestSpeed.toFixed(1)} km/h`} />
        <Metric
          label="Total"
          value={String((summary?.sampleCount ?? 0) + (summary?.gpsPointCount ?? 0))}
        />
      </View>
    </View>
  )
}

function HistoryBlock({
  block,
  previous,
  selected,
  samples,
  gpsSamples,
  loadingSamples,
  onPress,
}: {
  block: TelemetryHistoryBlock
  previous?: TelemetryHistoryBlock
  selected: boolean
  samples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  loadingSamples: boolean
  onPress: () => void
}) {
  const boundary = boundaryLabel(block, previous)
  return (
    <View>
      {boundary && (
        <View style={styles.boundaryRow}>
          <View style={styles.boundaryLine} />
          <Text style={styles.boundaryText}>{boundary}</Text>
        </View>
      )}
      <Pressable style={[styles.block, selected && styles.blockSelected]} onPress={onPress}>
        <View style={styles.blockTop}>
          <View style={styles.blockTitleWrap}>
            <Text style={styles.blockTitle} numberOfLines={1}>
              {block.deviceName}
            </Text>
            <Text style={styles.blockTime}>
              {formatTime(block.startAtMs)} - {formatTime(block.endAtMs)}
            </Text>
          </View>
          <View style={styles.speedPill}>
            <Text style={styles.speedValue}>
              {(block.maxAbsSpeedKmh || block.maxGpsSpeedKmh || 0).toFixed(1)}
            </Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Avg" value={`${block.avgAbsSpeedKmh.toFixed(1)} km/h`} />
          <Metric
            label="Voltage"
            value={block.minBatteryVoltage ? `${block.minBatteryVoltage.toFixed(1)} V` : '-'}
          />
          <Metric
            label="Distance"
            value={block.distanceDeltaM ? `${(block.distanceDeltaM / 1000).toFixed(2)} km` : '-'}
          />
          <Metric label="Board" value={String(block.sampleCount)} />
          <Metric label="GPS" value={String(block.gpsPointCount)} />
        </View>
        {block.faultCount > 0 && (
          <Text style={styles.faultText}>{block.faultCount} fault samples</Text>
        )}
        {selected && (
          <View style={styles.detail}>
            {loadingSamples ? (
              <ActivityIndicator color="#3b82f6" />
            ) : samples.length || gpsSamples.length ? (
              <>
                {samples.slice(0, 6).map((sample) => (
                  <SampleRow key={`board-${sample.id}`} sample={sample} />
                ))}
                {gpsSamples.slice(0, samples.length ? 3 : 8).map((sample) => (
                  <GpsRow key={`gps-${sample.id}`} sample={sample} />
                ))}
              </>
            ) : (
              <Text style={styles.detailEmpty}>No reconstructed history in this block.</Text>
            )}
          </View>
        )}
      </Pressable>
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

function SampleRow({ sample }: { sample: TelemetrySample }) {
  return (
    <View style={styles.sampleRow}>
      <Text style={styles.sampleTime}>{formatTime(sample.capturedAtMs)}</Text>
      <Text style={styles.sampleValue}>{sample.speedKmh.toFixed(1)} km/h</Text>
      <Text style={styles.sampleValue}>{sample.batteryVoltage.toFixed(1)} V</Text>
      <Text style={[styles.sampleValue, sample.hasFault && styles.sampleFault]}>
        {sample.hasFault ? `Fault ${sample.faultCode}` : `${(sample.dutyCycle * 100).toFixed(0)}%`}
      </Text>
    </View>
  )
}

function GpsRow({ sample }: { sample: HistoryGpsSample }) {
  return (
    <View style={styles.sampleRow}>
      <Text style={styles.sampleTime}>{formatTime(sample.capturedAtMs)}</Text>
      <Text style={styles.sampleValue}>GPS</Text>
      <Text style={styles.sampleValue}>
        {sample.speedMps != null ? `${(sample.speedMps * 3.6).toFixed(1)} km/h` : '-'}
      </Text>
      <Text style={styles.sampleValue}>
        {sample.accuracyM != null ? `±${sample.accuracyM.toFixed(0)} m` : '-'}
      </Text>
    </View>
  )
}

function boundaryLabel(
  block: TelemetryHistoryBlock,
  previous?: TelemetryHistoryBlock,
): string | null {
  if (block.boundaryBefore === 'gap' && block.gapBeforeMs)
    return `Gap ${formatDuration(block.gapBeforeMs)}`
  if (block.boundaryBefore === 'connected') return 'Connected'
  if (block.boundaryBefore === 'disconnected') return 'Disconnected'
  if (block.boundaryBefore === 'app_stop') return 'Stopped'
  if (block.boundaryBefore === 'error')
    return block.boundaryMessage ? `Error: ${block.boundaryMessage}` : 'Error'
  if (previous && previous.startAtMs - block.endAtMs > 90_000) {
    return `Gap ${formatDuration(previous.startAtMs - block.endAtMs)}`
  }
  return null
}

function formatDate(value: number | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString()
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#f9fafb', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  iconButtonDisabled: { opacity: 0.55 },
  errorBar: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#451a1a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorText: { color: '#fecaca', fontSize: 12, flex: 1 },
  liveCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#172033',
    borderWidth: 1,
    borderColor: '#30415d',
    gap: 10,
  },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4b5563' },
  liveDotActive: { backgroundColor: '#22c55e' },
  liveTitle: { color: '#f9fafb', fontSize: 14, fontWeight: '800' },
  liveAge: { color: '#9ca3af', fontSize: 12, fontVariant: ['tabular-nums'] },
  liveBars: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 2,
  },
  liveBarWrap: { flex: 1, justifyContent: 'flex-end' },
  liveBar: { borderRadius: 3, backgroundColor: '#3b82f6' },
  liveEmptyBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#374151' },
  liveBarsLabel: { color: '#6b7280', fontSize: 10, fontWeight: '700', marginTop: -6 },
  list: { padding: 12, paddingBottom: 28 },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center', gap: 8 },
  emptyTitle: { color: '#f9fafb', fontSize: 16, fontWeight: '700' },
  emptyText: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
  footerLoader: { paddingVertical: 16 },
  boundaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  boundaryLine: { width: 18, height: 1, backgroundColor: '#374151' },
  boundaryText: { color: '#9ca3af', fontSize: 12, fontWeight: '700' },
  block: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#273548',
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  blockSelected: { borderColor: '#3b82f6' },
  blockTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  blockTitleWrap: { flex: 1, minWidth: 0 },
  blockTitle: { color: '#f9fafb', fontSize: 16, fontWeight: '700' },
  blockTime: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  speedPill: {
    minWidth: 72,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValue: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  speedUnit: { color: '#6b7280', fontSize: 10 },
  metricsRow: { flexDirection: 'row', gap: 6 },
  metric: { flex: 1, minWidth: 0, gap: 2 },
  metricLabel: { color: '#6b7280', fontSize: 10, fontWeight: '700' },
  metricValue: { color: '#d1d5db', fontSize: 12, fontVariant: ['tabular-nums'] },
  faultText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },
  detail: { borderTopWidth: 1, borderTopColor: '#374151', paddingTop: 8, gap: 6 },
  detailEmpty: { color: '#6b7280', fontSize: 12 },
  sampleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sampleTime: { color: '#6b7280', fontSize: 12, width: 52, fontVariant: ['tabular-nums'] },
  sampleValue: {
    color: '#d1d5db',
    fontSize: 12,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  sampleFault: { color: '#fca5a5', fontWeight: '700' },
})

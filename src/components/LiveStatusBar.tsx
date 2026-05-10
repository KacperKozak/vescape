import { LightningIcon, NavigationArrowIcon } from 'phosphor-react-native'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'

type GpsFix = { timestamp: number; precise: boolean; accuracyM?: number | null }

function bleColor(status: string, scanStatus: string): string {
  if (status === 'connected') return theme.gps.color
  if (status === 'stale' || status === 'error') return theme.error.color
  if (
    scanStatus === 'scanning' ||
    status === 'connecting' ||
    status === 'discovering' ||
    status === 'subscribing' ||
    status === 'waiting_for_telemetry' ||
    status === 'reconnecting' ||
    status === 'disconnecting'
  ) {
    return theme.wheel.text
  }
  return '#475569'
}

function gpsLabel(gpsFix: GpsFix | null, ageSec: number | null): string {
  if (!gpsFix) return 'no fix'
  if (!gpsFix.precise)
    return gpsFix.accuracyM != null ? `±${gpsFix.accuracyM.toFixed(0)}m` : 'weak fix'
  if (ageSec != null && ageSec > 5) return `${ageSec.toFixed(0)}s old`
  return gpsFix.accuracyM != null ? `±${gpsFix.accuracyM.toFixed(0)}m` : 'good fix'
}

function gpsColor(gpsFix: GpsFix | null, ageSec: number | null): string {
  if (!gpsFix) return '#475569'
  if (!gpsFix.precise) return theme.error.color
  if (ageSec != null && ageSec > 5) return theme.warning.color
  return theme.gps.color
}

function formatAgeMs(ageMs: number | null): string {
  if (ageMs == null) return '-'
  if (ageMs < 1_000) return `${Math.max(0, Math.round(ageMs))}ms`
  return `${(ageMs / 1000).toFixed(1)}s`
}

function formatLastSec(ageMs: number | null): string {
  if (ageMs == null) return 'last -'
  return `last ${Math.max(0, Math.round(ageMs / 1000))}s`
}

export function LiveStatusBar() {
  const { liveStatus, status, scanStatus } = useBleStore(
    useShallow((s) => ({
      liveStatus: s.liveStatus,
      status: s.status,
      scanStatus: s.scanStatus,
    })),
  )
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [])

  const telemetryAgeMs = liveStatus.boardLastPacketAt ? nowMs - liveStatus.boardLastPacketAt : null
  const gpsAgeMs = liveStatus.gpsLastFixAt ? nowMs - liveStatus.gpsLastFixAt : null
  const gpsAgeSec = gpsAgeMs != null ? gpsAgeMs / 1000 : null
  const gpsFix = liveStatus.gpsLastFixAt
    ? {
        timestamp: liveStatus.gpsLastFixAt,
        precise: liveStatus.gpsPrecise,
        accuracyM: liveStatus.gpsAccuracyM,
      }
    : null

  const boardColor = bleColor(status, scanStatus)
  const boardText =
    liveStatus.boardAvgLatencyMs != null ? `${Math.round(liveStatus.boardAvgLatencyMs)}ms` : '-'
  const boardMeta = formatLastSec(telemetryAgeMs)
  const gpsText = gpsLabel(gpsFix, gpsAgeSec)
  const gpsClr = gpsColor(gpsFix, gpsAgeSec)

  if (expanded) {
    return (
      <Pressable style={styles.expandedPanel} onPress={() => setExpanded(false)}>
        <View style={styles.expandedSources}>
          <View style={styles.expandedSection}>
            <View style={styles.expandedLine}>
              <LightningIcon size={12} color={boardColor} weight="fill" />
              <Text style={styles.expandedLabel}>
                Board ({liveStatus.boardSampleCount} samples)
              </Text>
            </View>
            <View style={styles.expandedSubLine}>
              <Text style={[styles.expandedValue, { color: boardColor }]}>{boardText}</Text>
              <Text style={styles.expandedMeta}>{boardMeta}</Text>
            </View>
            <Text style={styles.expandedInfoSmall}>BLE state/latency</Text>
          </View>

          <View style={styles.expandedDivider} />

          <View style={styles.expandedSection}>
            <View style={styles.expandedLine}>
              <NavigationArrowIcon size={12} color={gpsClr} weight="fill" />
              <Text style={styles.expandedLabel}>GPS ({liveStatus.gpsSampleCount} samples)</Text>
            </View>
            <View style={styles.expandedSubLine}>
              <Text style={[styles.expandedValue, { color: gpsClr }]}>{gpsText}</Text>
              <Text style={styles.expandedMeta}>last {formatAgeMs(gpsAgeMs)}</Text>
            </View>
            <Text style={styles.expandedInfoSmall}>fix quality/accuracy</Text>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.bar} onPress={() => setExpanded(true)}>
        <View style={styles.sources}>
          <View style={styles.inlineSection}>
            <LightningIcon size={12} color={boardColor} weight="fill" />
            <Text style={styles.inlineLabel}>Board ({liveStatus.boardSampleCount})</Text>
            <Text style={[styles.inlineValue, { color: boardColor }]}>{boardText}</Text>
            <Text style={styles.inlineMeta}>{boardMeta}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.inlineSection}>
            <NavigationArrowIcon size={12} color={gpsClr} weight="fill" />
            <Text style={styles.inlineLabel}>GPS ({liveStatus.gpsSampleCount})</Text>
            <Text style={[styles.inlineValue, { color: gpsClr }]}>{gpsText}</Text>
            <Text style={styles.inlineMeta}>{formatAgeMs(gpsAgeMs)}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c1524',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  bar: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  sources: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inlineSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
  },
  inlineLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  inlineValue: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  inlineMeta: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: 1,
    backgroundColor: '#1e293b',
    alignSelf: 'stretch',
  },
  expandedPanel: {
    backgroundColor: '#0c1524',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 4,
  },
  expandedSources: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 8,
  },
  expandedSection: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 1,
    paddingVertical: 7,
  },
  expandedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandedSubLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 16,
  },
  expandedDivider: {
    width: 1,
    backgroundColor: '#1e293b',
    alignSelf: 'stretch',
  },
  expandedLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  expandedValue: {
    backgroundColor: '#111b2d',
    borderWidth: 1,
    borderColor: '#223147',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  expandedMeta: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  expandedInfoSmall: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 16,
  },
})

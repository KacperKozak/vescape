import { useEffect, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, Animated, StyleSheet, type ViewStyle } from 'react-native'
import { LightningIcon, NavigationArrowIcon, WarningCircleIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'
import { useBleStore } from '@/store/bleStore'
import { theme } from '@/constants/theme'

const COLORS: Record<string, { bg: string; text: string }> = {
  connected: { bg: theme.gps.bg, text: theme.gps.text },
  connecting: { bg: theme.wheel.bg, text: theme.wheel.text },
  scanning: { bg: theme.warning.bg, text: theme.warning.text },
  error: { bg: theme.error.bg, text: theme.error.text },
  idle: { bg: '#1f2937', text: '#9ca3af' },
}

export function StatusPill({ status, style }: { status: string; style?: ViewStyle }) {
  const { lastPacketAt, avgLatency } = useBleStore(
    useShallow((s) => ({ lastPacketAt: s.lastPacketAt, avgLatency: s.avgLatency })),
  )
  const pulseOpacity = useRef(new Animated.Value(0.35)).current
  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    if (lastPacketAt == null) return
    setIsStale(false)
    pulseOpacity.setValue(1)
    const anim = Animated.timing(pulseOpacity, {
      toValue: 0.35,
      duration: 600,
      useNativeDriver: true,
    })
    anim.start()
    const t = setTimeout(() => setIsStale(true), 2000)
    return () => {
      anim.stop()
      clearTimeout(t)
    }
  }, [lastPacketAt, pulseOpacity])

  const c = COLORS[status] ?? COLORS.idle!
  const pillBg = status === 'connected' && isStale ? COLORS.error.bg : c.bg
  const pillText = status === 'connected' && isStale ? COLORS.error.text : c.text
  const dotColor = isStale
    ? theme.error.color
    : avgLatency == null || avgLatency < 150
      ? theme.gps.color
      : avgLatency < 400
        ? theme.warning.color
        : theme.error.color
  const connectedNeedsText = status === 'connected' && (isStale || (avgLatency ?? 0) >= 400)

  if (status === 'connected' && !connectedNeedsText) {
    return (
      <View style={[styles.connectedPill, { backgroundColor: pillBg }, style]}>
        <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: pulseOpacity }]} />
        {avgLatency != null && (
          <Text style={[styles.latency, { color: dotColor }]}>{avgLatency}ms</Text>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.pill, { backgroundColor: pillBg }, style]}>
      {(status === 'connecting' || status === 'scanning') && (
        <ActivityIndicator size="small" color={pillText} style={styles.spinner} />
      )}
      {status === 'connected' && (
        <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: pulseOpacity }]} />
      )}
      {status === 'idle' && <LightningIcon size={12} color={pillText} weight="fill" />}
      {status === 'error' && <WarningCircleIcon size={12} color={pillText} weight="fill" />}
      {status === 'connected' && avgLatency != null && (
        <Text style={[styles.latency, { color: dotColor }]}>{avgLatency}ms</Text>
      )}
      <Text style={[styles.label, { color: pillText }]}>
        {status === 'connected' && isStale
          ? 'STALE'
          : status === 'connected'
            ? 'SLOW'
            : status === 'scanning'
              ? 'SEARCHING'
              : status.toUpperCase()}
      </Text>
    </View>
  )
}

export function GpsStatusBadge({ style }: { style?: ViewStyle }) {
  const gpsFix = useBleStore((s) => s.gpsFix)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const ageSec = gpsFix ? Math.max(0, (now - gpsFix.timestamp) / 1000) : null
  const isStale = ageSec != null && ageSec > 5
  const isRejected = !!gpsFix && !gpsFix.precise
  const bg = !gpsFix
    ? '#1f2937'
    : isRejected
      ? theme.error.bg
      : isStale
        ? theme.warning.bg
        : theme.gps.bg
  const color = !gpsFix
    ? '#9ca3af'
    : isRejected
      ? theme.error.text
      : isStale
        ? theme.warning.text
        : theme.gps.text
  const label =
    gpsFix?.accuracyM != null
      ? `±${gpsFix.accuracyM.toFixed(0)}m`
      : isStale && ageSec != null
        ? `${ageSec.toFixed(0)}s`
        : null

  return (
    <View style={[styles.gpsPill, { backgroundColor: bg }, style]}>
      <NavigationArrowIcon size={11} color={color} weight="fill" />
      {label && <Text style={[styles.gpsLabel, { color }]}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    gap: 4,
  },
  connectedPill: {
    minWidth: 42,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 14,
    gap: 4,
  },
  spinner: { transform: [{ scale: 0.7 }] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  latency: { fontSize: 10, fontWeight: '600', fontFamily: 'monospace' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  gpsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
})

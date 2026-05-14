import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Sparkline } from '@/components/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

interface BottomTelemetryStripProps {
  visible: boolean
}

const FOOTPAD_ACTIVE_V = 0.8

export function BottomTelemetryStrip({ visible }: BottomTelemetryStripProps) {
  const insets = useSafeAreaInsets()
  const windowMs = useLiveWindowMs()
  const motorTempSeries = useLiveMetric(liveSelectors.motorTemp)
  const controllerTempSeries = useLiveMetric(liveSelectors.controllerTemp)
  const motorCurrentSeries = useLiveMetric(liveSelectors.motorCurrent)
  const batteryCurrentSeries = useLiveMetric(liveSelectors.batteryCurrent)
  const adc1Series = useLiveMetric(liveSelectors.footpadAdc1)
  const adc2Series = useLiveMetric(liveSelectors.footpadAdc2)
  const pitchSeries = useLiveMetric(liveSelectors.pitch)

  if (!visible) return null

  const motorTemp = motorTempSeries.at(-1)?.value ?? null
  const controllerTemp = controllerTempSeries.at(-1)?.value ?? null
  const motorCurrent = motorCurrentSeries.at(-1)?.value ?? null
  const batteryCurrent = batteryCurrentSeries.at(-1)?.value ?? null
  const adc1 = adc1Series.at(-1)?.value ?? null
  const adc2 = adc2Series.at(-1)?.value ?? null
  const pitch = pitchSeries.at(-1)?.value ?? 0
  const pitchDeg = Math.max(-18, Math.min(18, pitch))

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.strip}>
        <Pressable style={styles.cellWide} onPress={() => router.push(routes.controlTemperatures)}>
          <Text style={styles.label}>Temps</Text>
          <View style={styles.tempRow}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
              {formatValue(motorTemp, telemetry.motorTemp.formatWithUnit)}
            </Text>
            <Text style={styles.valueMuted} numberOfLines={1} adjustsFontSizeToFit>
              {formatValue(controllerTemp, telemetry.controllerTemp.formatWithUnit)}
            </Text>
          </View>
          <View style={styles.sparkWrap}>
            <Sparkline
              points={motorTempSeries}
              color={telemetry.motorTemp.color}
              height={14}
              minSpan={20}
              showMaxBadge={false}
              windowMs={windowMs}
            />
          </View>
        </Pressable>

        <Pressable style={styles.cellWide} onPress={() => router.push(routes.controlCurrents)}>
          <Text style={styles.label}>Current</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(motorCurrent, telemetry.motorCurrent.formatWithUnit)}
          </Text>
          <Text style={styles.valueMuted} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(batteryCurrent, telemetry.battCurrent.formatWithUnit)}
          </Text>
        </Pressable>

        <Pressable style={styles.cell} onPress={() => router.push(routes.controlFootpad)}>
          <Text style={styles.label}>Pad</Text>
          <View style={styles.footpadRow}>
            <View
              style={[
                styles.footpadDot,
                adc1 != null && adc1 > FOOTPAD_ACTIVE_V && styles.footpadActive,
              ]}
            />
            <View
              style={[
                styles.footpadDot,
                adc2 != null && adc2 > FOOTPAD_ACTIVE_V && styles.footpadActive,
              ]}
            />
          </View>
        </Pressable>

        <Pressable style={styles.cell} onPress={() => router.push(routes.controlImu)}>
          <Text style={styles.label}>IMU</Text>
          <View style={styles.imuIcon}>
            <View style={[styles.imuBoard, { transform: [{ rotate: `${pitchDeg}deg` }] }]} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

function formatValue(value: number | null, format: (value: number) => string): string {
  return value == null || !Number.isFinite(value) ? '-' : format(value)
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 10,
  },
  strip: {
    minHeight: 58,
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(15, 23, 42, 0.64)',
    overflow: 'hidden',
  },
  cell: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    gap: 5,
  },
  cellWide: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  label: {
    color: 'rgba(203, 213, 225, 0.78)',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tempRow: {
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
  },
  value: {
    color: '#f8fafc',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  valueMuted: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  sparkWrap: {
    height: 14,
    width: '100%',
  },
  footpadRow: {
    flexDirection: 'row',
    gap: 5,
  },
  footpadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: 'rgba(100, 116, 139, 0.22)',
  },
  footpadActive: {
    borderColor: '#4ade80',
    backgroundColor: '#4ade80',
  },
  imuIcon: {
    width: 30,
    height: 16,
    justifyContent: 'center',
  },
  imuBoard: {
    width: 30,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#a78bfa',
  },
})

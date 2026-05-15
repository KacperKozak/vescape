import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Sparkline } from '@/components/charts/Sparkline'
import { BatteryIndicator } from '@/components/cards/BatteryIndicator'
import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { liveSelectors, useLiveMetric } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const FOOTPAD_ACTIVE_V = 0.8
export const STRIP_CONTENT_HEIGHT = 160

export function BottomTelemetryStrip() {
  const insets = useSafeAreaInsets()
  const windowMs = useLiveWindowMs()
  const motorTempSeries = useLiveMetric(liveSelectors.motorTemp)
  const controllerTempSeries = useLiveMetric(liveSelectors.controllerTemp)
  const motorCurrentSeries = useLiveMetric(liveSelectors.motorCurrent)
  const batteryCurrentSeries = useLiveMetric(liveSelectors.batteryCurrent)
  const adc1Series = useLiveMetric(liveSelectors.footpadAdc1)
  const adc2Series = useLiveMetric(liveSelectors.footpadAdc2)
  const pitchSeries = useLiveMetric(liveSelectors.pitch)

  const motorTemp = motorTempSeries.at(-1)?.value ?? null
  const controllerTemp = controllerTempSeries.at(-1)?.value ?? null
  const motorCurrent = motorCurrentSeries.at(-1)?.value ?? null
  const batteryCurrent = batteryCurrentSeries.at(-1)?.value ?? null
  const adc1 = adc1Series.at(-1)?.value ?? null
  const adc2 = adc2Series.at(-1)?.value ?? null
  const pitch = pitchSeries.at(-1)?.value ?? 0
  const pitchDeg = Math.max(-18, Math.min(18, pitch))

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom * 0.5, 8) }]}
      pointerEvents="box-none"
    >
      <View style={styles.strip}>
        <Pressable
          style={styles.metricCell}
          onPress={() => router.push(routes.controlTemperatures)}
        >
          <Text style={styles.subLabel}>Motor</Text>
          <Text style={styles.value} numberOfLines={1}>
            {fmtVal(motorTemp, telemetry.motorTemp.formatWithUnit)}
          </Text>
          <Sparkline
            points={motorTempSeries}
            color={telemetry.motorTemp.color}
            height={18}
            fmtMax={telemetry.motorTemp.formatWithUnit}
            showMaxBadge
            minSpan={20}
            windowMs={windowMs}
          />
        </Pressable>
        <Pressable
          style={styles.metricCell}
          onPress={() => router.push(routes.controlTemperatures)}
        >
          <Text style={styles.subLabel}>Ctrl</Text>
          <Text style={styles.value} numberOfLines={1}>
            {fmtVal(controllerTemp, telemetry.controllerTemp.formatWithUnit)}
          </Text>
          <Sparkline
            points={controllerTempSeries}
            color={telemetry.controllerTemp.color}
            height={18}
            fmtMax={telemetry.controllerTemp.formatWithUnit}
            showMaxBadge
            minSpan={20}
            windowMs={windowMs}
          />
        </Pressable>
        <Pressable style={styles.metricCell} onPress={() => router.push(routes.controlCurrents)}>
          <Text style={styles.subLabel}>Motor</Text>
          <Text style={styles.value} numberOfLines={1}>
            {fmtVal(motorCurrent, telemetry.motorCurrent.formatWithUnit)}
          </Text>
          <Sparkline
            points={motorCurrentSeries}
            color={telemetry.motorCurrent.color}
            height={18}
            fmtMax={telemetry.motorCurrent.formatWithUnit}
            showMaxBadge
            minSpan={20}
            windowMs={windowMs}
          />
        </Pressable>
        <Pressable style={styles.metricCell} onPress={() => router.push(routes.controlCurrents)}>
          <Text style={styles.subLabel}>Batt</Text>
          <Text style={styles.value} numberOfLines={1}>
            {fmtVal(batteryCurrent, telemetry.battCurrent.formatWithUnit)}
          </Text>
          <Sparkline
            points={batteryCurrentSeries}
            color={telemetry.battCurrent.color}
            height={18}
            fmtMax={telemetry.battCurrent.formatWithUnit}
            showMaxBadge
            minSpan={20}
            windowMs={windowMs}
          />
        </Pressable>
      </View>

      <View style={styles.bottomRow}>
        <Pressable style={styles.sideIcon} onPress={() => router.push(routes.controlImu)}>
          <View style={[styles.imuLine, { transform: [{ rotate: `${pitchDeg}deg` }] }]} />
        </Pressable>
        <BatteryIndicator transparent containerStyle={styles.batteryCenter} />
        <Pressable style={styles.sideIcon} onPress={() => router.push(routes.controlFootpad)}>
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
      </View>
    </View>
  )
}

function fmtVal(value: number | null, format: (value: number) => string): string {
  return value == null || !Number.isFinite(value) ? '-' : format(value)
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  strip: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 6,
    gap: 8,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  subLabel: {
    color: '#64748b',
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  value: {
    color: '#f8fafc',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  sideIcon: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  batteryCenter: {
    flex: 1,
    marginHorizontal: 4,
  },
  footpadRow: {
    flexDirection: 'row',
    gap: 6,
  },
  footpadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: 'transparent',
  },
  footpadActive: {
    borderColor: '#4ade80',
    backgroundColor: '#4ade80',
  },
  imuLine: {
    width: 32,
    height: 3,
    borderRadius: 1,
    backgroundColor: '#a78bfa',
  },
})

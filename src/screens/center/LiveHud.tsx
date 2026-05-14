import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { useBleStore } from '@/store/bleStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

interface LiveHudProps {
  visible: boolean
}

export function LiveHud({ visible }: LiveHudProps) {
  const insets = useSafeAreaInsets()
  useBleStore((s) => s.metricVersion)
  if (!visible) return null

  const speed = liveTelemetryRuntime.values.speedKmh.value
  const duty = liveTelemetryRuntime.values.dutyPercent.value
  const battery = liveTelemetryRuntime.values.batteryVoltage.value
  const motorTemp = liveTelemetryRuntime.values.motorTemp.value
  const controllerTemp = liveTelemetryRuntime.values.controllerTemp.value

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.topCluster, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable
          style={[styles.metric, styles.metricLarge]}
          onPress={() => router.push(routes.controlSpeed)}
        >
          <Text style={styles.label}>Speed</Text>
          <Text style={styles.valueLarge} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(speed, telemetry.speed.formatWithUnit)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.metric, styles.metricBattery]}
          onPress={() => router.push(routes.controlBattery)}
        >
          <Text style={styles.label}>Battery</Text>
          <Text style={styles.valueSmall} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(battery, telemetry.battVoltage.formatWithUnit)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.metric, styles.metricLarge]}
          onPress={() => router.push(routes.controlDuty)}
        >
          <Text style={styles.label}>Duty</Text>
          <Text style={styles.valueLarge} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(duty, telemetry.duty.formatWithUnit)}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.tempCluster} onPress={() => router.push(routes.controlTemperatures)}>
        <View style={styles.tempBox}>
          <Text style={styles.label}>Motor</Text>
          <Text style={styles.valueSmall} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(motorTemp, telemetry.motorTemp.formatWithUnit)}
          </Text>
        </View>
        <View style={styles.tempBox}>
          <Text style={styles.label}>Ctrl</Text>
          <Text style={styles.valueSmall} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(controllerTemp, telemetry.controllerTemp.formatWithUnit)}
          </Text>
        </View>
      </Pressable>
    </View>
  )
}

function formatValue(value: number | null, format: (value: number) => string): string {
  return value == null || !Number.isFinite(value) ? '-' : format(value)
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  topCluster: {
    position: 'absolute',
    top: 0,
    left: 86,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 8,
  },
  metric: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    alignItems: 'center',
  },
  metricLarge: {
    minWidth: 78,
  },
  metricBattery: {
    minWidth: 70,
    marginTop: 2,
  },
  label: {
    color: 'rgba(203, 213, 225, 0.82)',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  valueLarge: {
    color: '#f8fafc',
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  valueSmall: {
    color: '#f8fafc',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  tempCluster: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 76,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  tempBox: {
    minWidth: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
  },
})

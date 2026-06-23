import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { Canvas, Group } from '@shopify/react-native-skia'

import { SparklineMaxBadge } from '@/components/ui/charts/Sparkline'
import {
  buildSparklinePaths,
  SparklineLayer,
  type SparklinePathOptions,
} from '@/components/ui/charts/SparklineLayer'
import { BatteryBar } from '@/components/ui/base/BatteryBar'
import { interaction, theme } from '@/constants/theme'
import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { liveSelectors, useLiveBuckets, useLiveLatest } from '@/hooks/useLiveMetric'
import { useBatteryTelemetry } from '@/hooks/useBatteryTelemetry'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const FOOTPAD_ACTIVE_V = 0.8
export const STRIP_CONTENT_HEIGHT = 160
const SPARKLINE_HEIGHT = 18

type SparklineSlotId =
  | 'motorTemp'
  | 'controllerTemp'
  | 'motorCurrent'
  | 'batteryCurrent'
  | 'battery'

interface SparklineFrame {
  x: number
  y: number
  width: number
  height: number
}

interface SceneItem extends Omit<SparklinePathOptions, 'width' | 'height'> {
  id: SparklineSlotId
  color: string
  showMax?: boolean
}

interface BottomTelemetryStripProps {
  revealProgress?: SharedValue<number>
}

export function BottomTelemetryStrip({ revealProgress }: BottomTelemetryStripProps) {
  const insets = useSafeAreaInsets()
  const windowMs = useLiveWindowMs()
  const pitch = liveTelemetryRuntime.values.pitch
  const motorTempSeries = useLiveBuckets('motorTemp')
  const controllerTempSeries = useLiveBuckets('controllerTemp')
  const motorCurrentSeries = useLiveBuckets('motorCurrent')
  const batteryCurrentSeries = useLiveBuckets('batteryCurrent')
  const battery = useBatteryTelemetry()
  const bleStatus = useBleStore((s) => s.status)
  const sceneRef = useRef<View>(null)
  const slotRefs = useRef<Partial<Record<SparklineSlotId, View | null>>>({})
  const [frames, setFrames] = useState<Partial<Record<SparklineSlotId, SparklineFrame>>>({})

  const motorTemp = useLiveLatest(liveSelectors.motorTemp)
  const controllerTemp = useLiveLatest(liveSelectors.controllerTemp)
  const motorCurrent = useLiveLatest(liveSelectors.motorCurrent)
  const batteryCurrent = useLiveLatest(liveSelectors.batteryCurrent)
  const adc1 = useLiveLatest(liveSelectors.footpadAdc1)
  const adc2 = useLiveLatest(liveSelectors.footpadAdc2)
  const imuConnected = bleStatus === 'connected'
  const revealStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: revealProgress ? 74 * revealProgress.value : 0 }],
  }))
  const imuRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${imuConnected ? (pitch.value ?? 0) : 0}deg` }],
  }))
  const sceneItems: SceneItem[] = [
    {
      id: 'motorTemp',
      points: motorTempSeries,
      color: telemetry.motorTemp.color,
      minSpan: 20,
      windowMs,
      showMax: true,
    },
    {
      id: 'controllerTemp',
      points: controllerTempSeries,
      color: telemetry.controllerTemp.color,
      minSpan: 20,
      windowMs,
      showMax: true,
    },
    {
      id: 'motorCurrent',
      points: motorCurrentSeries,
      color: telemetry.motorCurrent.color,
      minSpan: 20,
      windowMs,
      showMax: true,
    },
    {
      id: 'batteryCurrent',
      points: batteryCurrentSeries,
      color: telemetry.battCurrent.color,
      minSpan: 20,
      windowMs,
      showMax: true,
    },
  ]
  sceneItems.push({
    id: 'battery',
    points: battery.series,
    color: battery.color,
    range: battery.range,
    windowMs: battery.windowMs,
  })
  const measureSlot = useCallback((id: SparklineSlotId) => {
    const slot = slotRefs.current[id]
    const scene = sceneRef.current
    if (!slot || !scene) return
    slot.measure((_, __, width, height, pageX, pageY) => {
      scene.measure((___, ____, _____, ______, scenePageX, scenePageY) => {
        const next = { x: pageX - scenePageX, y: pageY - scenePageY, width, height }
        setFrames((current) => {
          const previous = current[id]
          if (
            previous &&
            previous.x === next.x &&
            previous.y === next.y &&
            previous.width === next.width &&
            previous.height === next.height
          ) {
            return current
          }
          return { ...current, [id]: next }
        })
      })
    })
  }, [])
  const onSceneLayout = useCallback(() => {
    requestAnimationFrame(() => {
      for (const id of Object.keys(slotRefs.current) as SparklineSlotId[]) measureSlot(id)
    })
  }, [measureSlot])
  const slotProps = useCallback(
    (id: SparklineSlotId) => ({
      ref: (node: View | null) => {
        slotRefs.current[id] = node
      },
      onLayout: () => measureSlot(id),
      style: styles.sparklineSlot,
      pointerEvents: 'none' as const,
    }),
    [measureSlot],
  )

  return (
    <Animated.View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom * 0.5, 8) }]}
      pointerEvents="box-none"
    >
      <Animated.View style={revealStyle}>
        <View ref={sceneRef} style={styles.scene} onLayout={onSceneLayout}>
          <BottomSparklineScene items={sceneItems} frames={frames} />
          <View style={styles.strip}>
            <View style={styles.metricRow}>
              <TelemetryMetricCell
                label="Motor"
                value={motorTemp}
                points={motorTempSeries}
                color={telemetry.motorTemp.color}
                format={telemetry.motorTemp.formatWithUnit}
                onPress={() => router.push(routes.controlTemperatures)}
                testID="telemetry-motor-temp-cell"
                sparklineSlot={<View {...slotProps('motorTemp')} />}
              />
              <TelemetryMetricCell
                label="Ctrl"
                value={controllerTemp}
                points={controllerTempSeries}
                color={telemetry.controllerTemp.color}
                format={telemetry.controllerTemp.formatWithUnit}
                onPress={() => router.push(routes.controlTemperatures)}
                testID="telemetry-controller-temp-cell"
                sparklineSlot={<View {...slotProps('controllerTemp')} />}
              />
              <TelemetryMetricCell
                label="Motor"
                value={motorCurrent}
                points={motorCurrentSeries}
                color={telemetry.motorCurrent.color}
                format={telemetry.motorCurrent.formatWithUnit}
                onPress={() => router.push(routes.controlCurrents)}
                testID="telemetry-motor-current-cell"
                sparklineSlot={<View {...slotProps('motorCurrent')} />}
              />
              <TelemetryMetricCell
                label="Batt"
                value={batteryCurrent}
                points={batteryCurrentSeries}
                color={telemetry.battCurrent.color}
                format={telemetry.battCurrent.formatWithUnit}
                onPress={() => router.push(routes.controlCurrents)}
                testID="telemetry-battery-current-cell"
                sparklineSlot={<View {...slotProps('batteryCurrent')} />}
              />
            </View>
          </View>
          <View style={styles.bottomRow}>
            <Pressable
              style={({ pressed }) => [styles.sideIcon, pressed && styles.cellPressed]}
              android_ripple={interaction.rippleBorderless}
              onPress={() => router.push(routes.controlImu)}
            >
              <View
                style={[
                  styles.imuMarker,
                  { borderColor: imuConnected ? theme.target.color : theme.neutral.textMuted },
                ]}
              />
              <Animated.View
                style={[
                  styles.imuLine,
                  imuRotationStyle,
                  {
                    backgroundColor: imuConnected ? theme.target.color : theme.neutral.textMuted,
                  },
                ]}
              />
            </Pressable>
            <BatteryBar
              percent={battery.percent}
              voltage={battery.voltage}
              series={battery.series}
              range={battery.range}
              windowMs={battery.windowMs}
              hint={battery.hint}
              transparent
              containerStyle={styles.batteryCenter}
              onPress={() => router.push(routes.controlBattery)}
              sparklineSlot={<View {...slotProps('battery')} />}
            />
            <Pressable
              style={({ pressed }) => [styles.sideIcon, pressed && styles.cellPressed]}
              android_ripple={interaction.rippleBorderless}
              onPress={() => router.push(routes.controlFootpad)}
            >
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
      </Animated.View>
    </Animated.View>
  )
}

interface TelemetryMetricCellProps {
  label: string
  value: number | null
  points: { ts: number; value: number }[]
  color: string
  format: (value: number) => string
  onPress: () => void
  testID: string
  sparklineSlot: ReactNode
}

function TelemetryMetricCell({
  label,
  value,
  points,
  color,
  format,
  onPress,
  testID,
  sparklineSlot,
}: TelemetryMetricCellProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.metricCell, pressed && styles.cellPressed]}
      android_ripple={interaction.ripple}
      onPress={onPress}
      testID={testID}
    >
      <Text style={styles.subLabel}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {fmtVal(value, format)}
      </Text>
      <SparklineMaxBadge points={points} color={color} fmt={format} />
      {sparklineSlot}
    </Pressable>
  )
}

function BottomSparklineScene({
  items,
  frames,
}: {
  items: SceneItem[]
  frames: Partial<Record<SparklineSlotId, SparklineFrame>>
}) {
  const layers = useMemo(
    () =>
      items.flatMap((item) => {
        const frame = frames[item.id]
        if (!frame || frame.width < 1 || frame.height < 1) return []
        return [{ ...item, frame, paths: buildSparklinePaths({ ...item, ...frame }) }]
      }),
    [frames, items],
  )
  return (
    <Canvas style={styles.sceneCanvas} pointerEvents="none">
      {layers.map((layer) => (
        <Group
          key={layer.id}
          transform={[{ translateX: layer.frame.x }, { translateY: layer.frame.y }]}
        >
          <SparklineLayer paths={layer.paths} color={layer.color} showMax={layer.showMax} />
        </Group>
      ))}
    </Canvas>
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
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 20,
  },
  scene: { position: 'relative' },
  sceneCanvas: { position: 'absolute', inset: 0 },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sparklineSlot: { height: SPARKLINE_HEIGHT, width: '100%' },
  subLabel: {
    color: theme.neutral.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  value: {
    color: theme.neutral.textPrimary,
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
    borderColor: theme.neutral.textDim,
    backgroundColor: 'transparent',
  },
  footpadActive: {
    borderColor: theme.gps.text,
    backgroundColor: theme.gps.text,
  },
  cellPressed: {
    opacity: interaction.pressedOpacity,
  },
  imuLine: {
    width: 32,
    height: 1,
    borderRadius: 1,
    backgroundColor: theme.target.color,
  },
  imuMarker: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.target.color,
    backgroundColor: 'transparent',
  },
})

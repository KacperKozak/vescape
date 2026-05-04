import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { BatteryBar } from '@/components/BatteryBar'
import { SpeedGauge } from '@/components/charts/SpeedGauge'
import { type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { estimateBatteryPercent } from '@/helpers/battery'
import { fmt, fmtKm } from '@/helpers/format'
import { bearingTo, clockHour, fmtDistance, haversineM } from '@/helpers/geo'
import { emaSeries } from '@/helpers/smoothing'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { useMapStore } from '@/store/mapStore'
import { REFLOAT_STATE_NAMES, stateCompat } from '@/vesc/refloat'
import { FAULT_NAMES, type RefloatValues } from '@/vesc/types'

const DASH = '—'
// Voltage sag smoothing: 20s half-life dampens throttle-burst dips while
// still tracking real drain over a ~1 min window.
const BATTERY_SMOOTH_HALF_LIFE_MS = 20_000
const SPEED_GAUGE_MAX_KMH = 50

// Inline style/prop objects must be hoisted — fresh refs break Sparkline's
// useMemo deps and force a full polyline reprojection every BLE packet.
const RANGE_PCT = { min: 0, max: 100 }
const DUTY_FMT_MAX = (v: number) => `${v.toFixed(0)}%`
const TEMP_FMT_MAX = (v: number) => `${v.toFixed(0)}°C`
const AMP_FMT_MAX = (v: number) => `${v.toFixed(0)} A`
const TEMP_MIN_SPAN = 30
const AMP_MIN_SPAN = 20

export function TelemetryView() {
  const { recentTelemetry, recentLocations } = useBleStore(
    useShallow((s) => ({
      recentTelemetry: s.recentTelemetry,
      recentLocations: s.recentLocations,
    })),
  )
  const activeBoard = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))
  const targetLocation = useMapStore((s) => s.targetLocation)

  const v = (recentTelemetry.at(-1) ?? null) as RefloatValues | null
  const gpsFix = recentLocations.at(-1) ?? null

  // Last-10-min series — store already trims this window.
  const series = useMemo(() => {
    const speed: SparklinePoint[] = []
    const rawVoltage: SparklinePoint[] = []
    const duty: SparklinePoint[] = []
    const motorTemp: SparklinePoint[] = []
    const ctrlTemp: SparklinePoint[] = []
    const motorCurrent: SparklinePoint[] = []
    const battCurrent: SparklinePoint[] = []
    for (const t of recentTelemetry) {
      const ts = t.lastPacketAt
      speed.push({ ts, value: Math.abs(t.speed) })
      rawVoltage.push({ ts, value: t.batteryVoltage })
      duty.push({ ts, value: Math.abs(t.dutyCycle) * 100 })
      if (t.tempMotor != null && t.tempMotor > 0) motorTemp.push({ ts, value: t.tempMotor })
      if (t.tempMosfet != null) ctrlTemp.push({ ts, value: t.tempMosfet })
      motorCurrent.push({ ts, value: t.motorCurrent })
      battCurrent.push({ ts, value: t.batteryCurrent })
    }
    // Smooth voltage first, then map to %. Mapping is monotonic so the
    // resulting % series is equally smooth.
    const smoothVoltage = emaSeries(rawVoltage, BATTERY_SMOOTH_HALF_LIFE_MS)
    const battery: SparklinePoint[] = []
    for (const p of smoothVoltage) {
      const pct = estimateBatteryPercent(
        p.value,
        activeBoard?.minVoltage ?? null,
        activeBoard?.maxVoltage ?? null,
      )
      if (pct != null) battery.push({ ts: p.ts, value: pct })
    }
    return {
      speed,
      battery,
      duty,
      motorTemp,
      ctrlTemp,
      smoothVoltage,
      motorCurrent,
      battCurrent,
    }
  }, [recentTelemetry, activeBoard?.minVoltage, activeBoard?.maxVoltage])

  const compat = v ? stateCompat(v.state) : 0
  const stateName = v ? (REFLOAT_STATE_NAMES[compat] ?? `STATE_${compat}`) : DASH
  const faultName = v?.hasFault ? (FAULT_NAMES[v.faultCode] ?? `CODE_${v.faultCode}`) : stateName

  // Use smoothed voltage so the indicator doesn't bounce with sag.
  const smoothVoltage = series.smoothVoltage.at(-1)?.value ?? v?.batteryVoltage ?? null
  const batteryPct =
    smoothVoltage != null
      ? estimateBatteryPercent(
          smoothVoltage,
          activeBoard?.minVoltage ?? null,
          activeBoard?.maxVoltage ?? null,
        )
      : null
  const batteryConfigured = activeBoard?.minVoltage != null && activeBoard?.maxVoltage != null

  const gpsSpeedKmh = gpsFix?.speedMps != null ? gpsFix.speedMps * 3.6 : null

  const targetDistanceM = gpsFix && targetLocation ? haversineM(gpsFix, targetLocation) : null
  const targetBearing = gpsFix && targetLocation ? bearingTo(gpsFix, targetLocation) : null
  const targetClock =
    gpsFix?.bearingDeg != null && targetBearing != null
      ? clockHour(gpsFix.bearingDeg, targetBearing)
      : null

  const dutyAbsPct = v ? Math.abs(v.dutyCycle) * 100 : 0
  const imuValue = v ? `P${fmt(v.pitch, 0)}° R${fmt(v.roll, 0)}° B${fmt(v.balancePitch, 0)}°` : DASH
  // Refloat reports tempMotor=0 when the sensor is unwired/disabled; treat as
  // "no reading" so we render a dash instead of misleading "0 °C".
  const motorTemp = v?.tempMotor != null && v.tempMotor > 0 ? v.tempMotor : null

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {targetLocation && (
        <>
          <Text style={styles.sectionLabel}>TARGET</Text>
          <View style={styles.row}>
            <TelemetryCard
              label="Distance"
              value={targetDistanceM != null ? fmtDistance(targetDistanceM) : DASH}
            />
            <TelemetryCard
              label="Direction"
              value={targetBearing != null ? `${Math.round(targetBearing)}°` : DASH}
              sub={targetClock != null ? `${targetClock} o'clock` : undefined}
            />
          </View>
        </>
      )}

      <View style={!v && styles.dimmed}>
        <BatteryBar
          percent={batteryConfigured ? batteryPct : null}
          voltage={smoothVoltage}
          series={batteryConfigured ? series.battery : undefined}
          hint={!batteryConfigured ? 'Set min/max V in board settings' : undefined}
        />

        <SpeedGauge
          value={v ? Math.abs(v.speed) : null}
          gpsValue={gpsSpeedKmh}
          series={series.speed}
          distance={v?.odometer != null ? `${fmtKm(v.odometer)} km` : undefined}
          max={SPEED_GAUGE_MAX_KMH}
        />

        <View style={styles.row}>
          <TelemetryCard
            label="Duty Cycle"
            value={v ? dutyAbsPct.toFixed(1) : DASH}
            unit={v ? '%' : undefined}
            series={series.duty}
            seriesColor={theme.bran.color}
            fmtMax={DUTY_FMT_MAX}
            range={RANGE_PCT}
          />
          <TelemetryCard
            label="Motor Temp"
            value={motorTemp != null ? fmt(motorTemp) : DASH}
            unit={motorTemp != null ? '°C' : undefined}
            series={series.motorTemp}
            seriesColor={theme.warning.color}
            fmtMax={TEMP_FMT_MAX}
            minSpan={TEMP_MIN_SPAN}
          />
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="Motor Current"
            value={v ? fmt(v.motorCurrent) : DASH}
            unit={v ? 'A' : undefined}
            series={series.motorCurrent}
            seriesColor={theme.bran.color}
            fmtMax={AMP_FMT_MAX}
            minSpan={AMP_MIN_SPAN}
          />
          <TelemetryCard
            label="Controller Temp"
            value={v?.tempMosfet != null ? fmt(v.tempMosfet) : DASH}
            unit={v?.tempMosfet != null ? '°C' : undefined}
            series={series.ctrlTemp}
            seriesColor={theme.warning.color}
            fmtMax={TEMP_FMT_MAX}
            minSpan={TEMP_MIN_SPAN}
          />
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="Batt Current"
            value={v ? fmt(v.batteryCurrent) : DASH}
            unit={v ? 'A' : undefined}
            series={series.battCurrent}
            seriesColor={theme.gps.color}
            fmtMax={AMP_FMT_MAX}
            minSpan={AMP_MIN_SPAN}
          />
          <TelemetryCard label="State" value={v ? faultName : DASH} />
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="Footpad"
            value={v ? `${v.adc1.toFixed(2)} / ${v.adc2.toFixed(2)}` : DASH}
          />
          <TelemetryCard label="IMU" value={imuValue} />
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  grid: { padding: 12, paddingBottom: 96 },
  dimmed: { opacity: 0.35 },
  sectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 4,
    marginLeft: 4,
  },
  row: { flexDirection: 'row', marginBottom: 4 },
})

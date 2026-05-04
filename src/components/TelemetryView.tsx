import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { Sparkline, type SparklinePoint } from '@/components/charts/Sparkline'
import { TelemetryCard } from '@/components/TelemetryCard'
import { theme } from '@/constants/theme'
import { estimateBatteryPercent, fmtBatteryPercent } from '@/helpers/battery'
import { fmt, fmtKm, fmtSpeed } from '@/helpers/format'
import { bearingTo, clockHour, fmtDistance, haversineM } from '@/helpers/geo'
import { emaSeries } from '@/helpers/smoothing'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { useMapStore } from '@/store/mapStore'
import { REFLOAT_STATE_NAMES } from '@/vesc/refloat'
import { FAULT_NAMES, type RefloatValues } from '@/vesc/types'

interface BigStatProps {
  label: string
  value: string
  unit?: string
  /** Tiny meta-text, top-right of card header (e.g. "Set min/max V…"). */
  hint?: string
  /** Prominent secondary value rendered under the main number (e.g. GPS speed). */
  secondary?: string
  alert?: boolean
  series?: SparklinePoint[]
  seriesColor?: string
  /** Pass to render max-marker + badge. Omit for clean line only. */
  fmtMax?: (value: number) => string
  /** Fixed Y range — overrides auto-range. */
  range?: { min: number; max: number }
  /** Min Y span for auto-range (smooths small jitter). */
  minSpan?: number
}

function BigStat({
  label,
  value,
  unit,
  hint,
  secondary,
  alert = false,
  series,
  seriesColor,
  fmtMax,
  range,
  minSpan,
}: BigStatProps) {
  return (
    <View style={[styles.bigCard, alert && styles.bigCardAlert]}>
      {alert && <View style={styles.alertDot} />}
      <View style={styles.bigHeader}>
        <Text style={styles.bigLabel}>{label}</Text>
        {hint ? <Text style={styles.bigHint}>{hint}</Text> : null}
      </View>
      <Text style={styles.bigValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.bigUnit}> {unit}</Text> : null}
      </Text>
      {secondary ? <Text style={styles.bigSecondary}>{secondary}</Text> : null}
      {series && series.length > 1 ? (
        <Sparkline
          points={series}
          color={seriesColor ?? theme.wheel.color}
          height={26}
          fmtMax={fmtMax}
          range={range}
          minSpan={minSpan}
        />
      ) : null}
    </View>
  )
}

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

  // Battery voltage smoothing — counters voltage sag under load.
  // 20s half-life: smooths spikes during throttle bursts but still tracks
  // genuine drain over a ~1 min window.
  const BATTERY_SMOOTH_HALF_LIFE_MS = 20_000

  // Series (last 10 min — store already trims this window)
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

  const stateCompat = v ? v.state & 0xf : 0
  const stateName = v ? (REFLOAT_STATE_NAMES[stateCompat] ?? `STATE_${stateCompat}`) : '—'
  const hasFault = v?.hasFault ?? false
  const faultName = v?.hasFault ? (FAULT_NAMES[v.faultCode] ?? `CODE_${v.faultCode}`) : stateName

  // Use smoothed voltage so the big number / % don't bounce with sag.
  // Falls back to raw if smoothing produced nothing yet (single sample).
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
  const speedSecondary = gpsSpeedKmh != null ? `GPS ${gpsSpeedKmh.toFixed(1)} km/h` : undefined

  // Target-location helpers (kept; unrelated to ride stats)
  const targetDistanceM = gpsFix && targetLocation ? haversineM(gpsFix, targetLocation) : null
  const targetBearing = gpsFix && targetLocation ? bearingTo(gpsFix, targetLocation) : null
  const targetClock =
    gpsFix?.bearingDeg != null && targetBearing != null
      ? clockHour(gpsFix.bearingDeg, targetBearing)
      : null

  const dutyAbsPct = v ? Math.abs(v.dutyCycle) * 100 : 0
  const dutyAlert = v ? dutyAbsPct > 85 : false
  const motorTempAlert = (v?.tempMotor ?? 0) > 100
  const ctrlTempAlert = (v?.tempMosfet ?? 0) > 80
  const batteryAlert = batteryPct != null && batteryPct < 15

  // Combined IMU summary (small tile — pitch/roll/bal not critical)
  const imuValue = v ? `P${fmt(v.pitch, 0)}° R${fmt(v.roll, 0)}° B${fmt(v.balancePitch, 0)}°` : '—'
  const imuAlert = v ? Math.abs(v.pitch) > 25 || Math.abs(v.roll) > 35 : false

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {targetLocation && (
        <>
          <Text style={styles.sectionLabel}>TARGET</Text>
          <View style={styles.row}>
            <TelemetryCard
              label="Distance"
              value={targetDistanceM != null ? fmtDistance(targetDistanceM) : '—'}
            />
            <TelemetryCard
              label="Direction"
              value={targetBearing != null ? `${Math.round(targetBearing)}°` : '—'}
              sub={targetClock != null ? `${targetClock} o'clock` : undefined}
            />
          </View>
        </>
      )}

      <View style={!v && styles.dimmed}>
        {/* HERO — speed */}
        <BigStat
          label="Speed"
          value={v ? fmtSpeed(v.speed) : '—'}
          unit={v ? 'km/h' : undefined}
          secondary={speedSecondary}
          series={series.speed}
          seriesColor={theme.wheel.color}
          fmtMax={(value) => `${value.toFixed(0)} km/h`}
          minSpan={10}
        />

        {/* PRIMARY STATS */}
        <BigStat
          label="Battery"
          value={
            batteryConfigured
              ? fmtBatteryPercent(batteryPct)
              : smoothVoltage != null
                ? fmt(smoothVoltage)
                : '—'
          }
          unit={batteryConfigured ? '%' : smoothVoltage != null ? 'V' : undefined}
          secondary={
            batteryConfigured && smoothVoltage != null ? `${fmt(smoothVoltage)} V` : undefined
          }
          hint={!batteryConfigured ? 'Set min/max V in board settings' : undefined}
          alert={batteryAlert}
          series={batteryConfigured ? series.battery : undefined}
          seriesColor={theme.gps.color}
          range={{ min: 0, max: 100 }}
        />

        <BigStat
          label="Duty Cycle"
          value={v ? dutyAbsPct.toFixed(1) : '—'}
          unit={v ? '%' : undefined}
          alert={dutyAlert}
          series={series.duty}
          seriesColor={theme.bran.color}
          fmtMax={(value) => `${value.toFixed(0)}%`}
          range={{ min: 0, max: 100 }}
        />

        <BigStat
          label="Motor Temp"
          value={v?.tempMotor != null && v.tempMotor > 0 ? fmt(v.tempMotor) : 'N/A'}
          unit={v?.tempMotor != null && v.tempMotor > 0 ? '°C' : undefined}
          alert={motorTempAlert}
          series={series.motorTemp}
          seriesColor={theme.warning.color}
          fmtMax={(value) => `${value.toFixed(0)}°C`}
          minSpan={30}
        />

        <BigStat
          label="Controller Temp"
          value={v?.tempMosfet != null ? fmt(v.tempMosfet) : 'N/A'}
          unit={v?.tempMosfet != null ? '°C' : undefined}
          alert={ctrlTempAlert}
          series={series.ctrlTemp}
          seriesColor={theme.warning.color}
          fmtMax={(value) => `${value.toFixed(0)}°C`}
          minSpan={30}
        />

        <BigStat
          label="Total Distance"
          value={v?.odometer != null ? fmtKm(v.odometer) : '—'}
          unit={v?.odometer != null ? 'km' : undefined}
        />

        {/* SECONDARY TILES */}
        <Text style={styles.sectionLabel}>OTHER</Text>
        <View style={styles.row}>
          <TelemetryCard
            label="Motor Current"
            value={v ? fmt(v.motorCurrent) : '—'}
            unit={v ? 'A' : undefined}
            series={series.motorCurrent}
            seriesColor={theme.bran.color}
            fmtMax={(value) => `${value.toFixed(0)} A`}
            minSpan={20}
          />
          <TelemetryCard
            label="Batt Current"
            value={v ? fmt(v.batteryCurrent) : '—'}
            unit={v ? 'A' : undefined}
            series={series.battCurrent}
            seriesColor={theme.gps.color}
            fmtMax={(value) => `${value.toFixed(0)} A`}
            minSpan={20}
          />
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="State"
            value={v ? faultName : '—'}
            alert={v ? hasFault || stateCompat >= 6 : false}
          />
          <TelemetryCard
            label="Footpad"
            value={v ? `${v.adc1.toFixed(2)} / ${v.adc2.toFixed(2)}` : '—'}
          />
        </View>
        <View style={styles.row}>
          <TelemetryCard label="IMU" value={imuValue} alert={imuAlert} />
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  grid: { padding: 12, paddingBottom: 32 },
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
  bigCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    marginBottom: 6,
    gap: 4,
  },
  bigCardAlert: {
    borderWidth: 1,
    borderColor: theme.error.border,
  },
  alertDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.error.color,
  },
  bigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  bigLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bigHint: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bigValue: {
    color: '#f1f5f9',
    fontSize: 38,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  bigUnit: {
    color: '#64748b',
    fontSize: 18,
    fontWeight: '400',
  },
  bigSecondary: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
    marginTop: -2,
  },
})

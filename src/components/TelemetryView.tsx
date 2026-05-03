import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { TelemetryCard } from './TelemetryCard'
import { FAULT_NAMES } from '@/vesc/types'
import { REFLOAT_STATE_NAMES } from '@/vesc/refloat'
import { fmt, fmtSpeed, fmtKm } from '@/helpers/format'
import { haversineM, bearingTo, clockHour, fmtDistance } from '@/helpers/geo'

export function TelemetryView() {
  const {
    refloatValues: v,
    status,
    gpsFix,
  } = useBleStore(
    useShallow((s) => ({
      refloatValues: s.refloatValues,
      status: s.status,
      gpsFix: s.gpsFix,
    })),
  )
  const targetLocation = useMapStore((s) => s.targetLocation)
  const stateCompat = v ? v.state & 0xf : 0
  const isCharging = stateCompat === 14
  const stateName = v ? (REFLOAT_STATE_NAMES[stateCompat] ?? `STATE_${stateCompat}`) : '—'
  const hasFault = v?.hasFault ?? false
  const faultName = v?.hasFault ? (FAULT_NAMES[v.faultCode] ?? `CODE_${v.faultCode}`) : stateName
  const speedSign = v && v.erpm < 0 ? '-' : ''
  const targetDistanceM = gpsFix && targetLocation ? haversineM(gpsFix, targetLocation) : null
  const targetBearing = gpsFix && targetLocation ? bearingTo(gpsFix, targetLocation) : null
  const targetClock =
    gpsFix?.bearingDeg != null && targetBearing != null
      ? clockHour(gpsFix.bearingDeg, targetBearing)
      : null

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
      <Text style={styles.sectionLabel}>GPS</Text>
      <View style={styles.row}>
        <TelemetryCard
          label="GPS Speed"
          value={gpsFix?.speedMps != null ? (gpsFix.speedMps * 3.6).toFixed(1) : '—'}
          unit={gpsFix?.speedMps != null ? 'km/h' : undefined}
        />
        <TelemetryCard
          label="Location"
          value={
            gpsFix ? `${gpsFix.latitude.toFixed(5)}, ${gpsFix.longitude.toFixed(5)}` : 'No fix'
          }
        />
      </View>
      {status === 'connecting' && (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.statusText}>Connecting to board…</Text>
        </View>
      )}
      {status === 'connected' && !v && (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color="#4ade80" />
          <Text style={styles.statusText}>Waiting for board telemetry…</Text>
        </View>
      )}
      <View style={!v && styles.dimmed}>
        <Text style={styles.sectionLabel}>RIDING</Text>
        <View style={styles.row}>
          <View style={styles.cardWide}>
            <Text style={styles.cardLabel}>Speed</Text>
            <Text style={styles.bigValue}>
              {v ? speedSign : ''}
              {v ? fmtSpeed(v.speed) : '—'}
              {v != null && <Text style={styles.bigUnit}> km/h</Text>}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="Pitch"
            value={v ? fmt(v.pitch) : '—'}
            unit={v ? '°' : undefined}
            alert={v ? Math.abs(v.pitch) > 25 : false}
          />
          <TelemetryCard
            label="Roll"
            value={v ? fmt(v.roll) : '—'}
            unit={v ? '°' : undefined}
            alert={v ? Math.abs(v.roll) > 35 : false}
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
        <Text style={styles.sectionLabel}>ELECTRICAL</Text>
        <View style={styles.row}>
          <TelemetryCard
            label="Voltage"
            value={v ? fmt(v.batteryVoltage) : '—'}
            unit={v ? 'V' : undefined}
            charging={isCharging}
          />
          <TelemetryCard
            label="Batt Current"
            value={v ? fmt(v.batteryCurrent) : '—'}
            unit={v ? 'A' : undefined}
          />
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="Motor Current"
            value={v ? fmt(v.motorCurrent) : '—'}
            unit={v ? 'A' : undefined}
          />
          <TelemetryCard label="ERPM" value={v ? v.erpm.toFixed(0) : '—'} />
        </View>
        <View style={styles.row}>
          <TelemetryCard
            label="Duty Cycle"
            value={v ? (v.dutyCycle * 100).toFixed(1) : '—'}
            unit={v ? '%' : undefined}
            alert={v ? Math.abs(v.dutyCycle) > 0.85 : false}
          />
          <TelemetryCard
            label="Bal. Pitch"
            value={v ? fmt(v.balancePitch) : '—'}
            unit={v ? '°' : undefined}
          />
        </View>
        {v && (v.tempMosfet != null || v.tempMotor != null) && (
          <>
            <Text style={styles.sectionLabel}>THERMAL</Text>
            <View style={styles.row}>
              <TelemetryCard
                label="MOSFET Temp"
                value={v.tempMosfet != null ? fmt(v.tempMosfet) : 'N/A'}
                unit={v.tempMosfet != null ? '°C' : undefined}
                alert={(v.tempMosfet ?? 0) > 80}
              />
              <TelemetryCard
                label="Motor Temp"
                value={v.tempMotor != null && v.tempMotor > 0 ? fmt(v.tempMotor) : 'N/A'}
                unit={v.tempMotor != null && v.tempMotor > 0 ? '°C' : undefined}
                alert={(v.tempMotor ?? 0) > 100}
              />
            </View>
          </>
        )}
        {v && v.odometer != null && (
          <>
            <Text style={styles.sectionLabel}>ODOMETER</Text>
            <View style={styles.row}>
              <TelemetryCard label="Total Distance" value={fmtKm(v.odometer)} unit="km" />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  statusText: { color: '#94a3b8', fontSize: 16 },
  grid: { padding: 12, paddingBottom: 32 },
  inlineStatus: {
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dimmed: { opacity: 0.35 },
  sectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 2,
    marginLeft: 4,
  },
  row: { flexDirection: 'row', marginBottom: 4 },
  cardWide: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    margin: 4,
    gap: 6,
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigValue: { color: '#f1f5f9', fontSize: 48, fontFamily: 'monospace', fontWeight: '700' },
  bigUnit: { color: '#64748b', fontSize: 20, fontWeight: '400' },
})

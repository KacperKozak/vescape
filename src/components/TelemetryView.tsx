import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useBleStore } from '@/src/store/bleStore'
import { useMapStore } from '@/src/store/mapStore'
import { TelemetryCard } from './TelemetryCard'
import { FAULT_NAMES } from '@/src/vesc/types'
import { REFLOAT_STATE_NAMES } from '@/src/vesc/refloat'
import { fmt, fmtSpeed, fmtKm } from '@/src/helpers/format'
import { haversineM, bearingTo, clockHour, fmtDistance } from '@/src/helpers/geo'

export function TelemetryView() {
  const { refloatValues: v, status, gpsFix } = useBleStore()
  const { targetLocation } = useMapStore()
  const stateCompat = v ? v.state & 0xf : 0
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

  const gpsAgeSec = gpsFix ? Math.max(0, (Date.now() - gpsFix.timestamp) / 1000) : null
  const gpsStatus = !gpsFix
    ? 'Waiting'
    : gpsFix.precise
      ? gpsFix.saved
        ? 'Saving'
        : 'Accepted'
      : 'Rejected'

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
          label="Precision"
          value={gpsFix?.accuracyM != null ? `±${gpsFix.accuracyM.toFixed(1)}` : '—'}
          unit={gpsFix?.accuracyM != null ? 'm' : undefined}
          alert={!!gpsFix && !gpsFix.saved}
        />
      </View>
      <View style={styles.row}>
        <TelemetryCard
          label="GPS Recording"
          value={gpsStatus}
          unit={gpsAgeSec != null ? `${gpsAgeSec.toFixed(0)}s ago` : undefined}
          alert={gpsStatus === 'Rejected'}
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
      {!v && status !== 'connecting' && status !== 'connected' && (
        <View style={styles.inlineStatus}>
          <Text style={styles.statusText}>Board telemetry unavailable</Text>
        </View>
      )}
      {!v && <View style={styles.bottomSpacer} />}
      {!v ? null : (
        <>
          <Text style={styles.sectionLabel}>RIDING</Text>
          <View style={styles.row}>
            <View style={styles.cardWide}>
              <Text style={styles.cardLabel}>Speed</Text>
              <Text style={styles.bigValue}>
                {speedSign}
                {fmtSpeed(v.speed)}
                <Text style={styles.bigUnit}> km/h</Text>
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <TelemetryCard
              label="Pitch"
              value={fmt(v.pitch)}
              unit="°"
              alert={Math.abs(v.pitch) > 25}
            />
            <TelemetryCard
              label="Roll"
              value={fmt(v.roll)}
              unit="°"
              alert={Math.abs(v.roll) > 35}
            />
          </View>
          <View style={styles.row}>
            <TelemetryCard label="State" value={faultName} alert={hasFault || stateCompat >= 6} />
            <TelemetryCard label="Footpad" value={`${v.adc1.toFixed(2)} / ${v.adc2.toFixed(2)}`} />
          </View>
          <Text style={styles.sectionLabel}>ELECTRICAL</Text>
          <View style={styles.row}>
            <TelemetryCard label="Voltage" value={fmt(v.batteryVoltage)} unit="V" />
            <TelemetryCard label="Batt Current" value={fmt(v.batteryCurrent)} unit="A" />
          </View>
          <View style={styles.row}>
            <TelemetryCard label="Motor Current" value={fmt(v.motorCurrent)} unit="A" />
            <TelemetryCard label="ERPM" value={v.erpm.toFixed(0)} />
          </View>
          <View style={styles.row}>
            <TelemetryCard
              label="Duty Cycle"
              value={(v.dutyCycle * 100).toFixed(1)}
              unit="%"
              alert={Math.abs(v.dutyCycle) > 0.85}
            />
            <TelemetryCard label="Bal. Pitch" value={fmt(v.balancePitch)} unit="°" />
          </View>
          {(v.tempMosfet != null || v.tempMotor != null) && (
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
          {v.odometer != null && (
            <>
              <Text style={styles.sectionLabel}>ODOMETER</Text>
              <View style={styles.row}>
                <TelemetryCard label="Total Distance" value={fmtKm(v.odometer)} unit="km" />
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  statusText: { color: '#9ca3af', fontSize: 16 },
  grid: { padding: 12, paddingBottom: 32 },
  inlineStatus: {
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  bottomSpacer: { height: 16 },
  sectionLabel: {
    color: '#4b5563',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 2,
    marginLeft: 4,
  },
  row: { flexDirection: 'row', marginBottom: 4 },
  cardWide: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    margin: 4,
    gap: 6,
  },
  cardLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigValue: { color: '#f9fafb', fontSize: 48, fontFamily: 'monospace', fontWeight: '700' },
  bigUnit: { color: '#6b7280', fontSize: 20, fontWeight: '400' },
})

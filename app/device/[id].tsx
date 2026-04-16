import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';

import { useBleStore } from '@/src/store/bleStore';
import { TelemetryCard } from '@/src/components/TelemetryCard';
import { FAULT_NAMES } from '@/src/vesc/types';
import { REFLOAT_STATE_NAMES } from '@/src/vesc/refloat';
import { fmt, fmtSpeed, fmtKm } from '@/src/helpers/format';

interface StatusPillProps { status: string }

function StatusPill({ status }: StatusPillProps) {
  const { lastPacketAt, avgLatency } = useBleStore();

  const colors: Record<string, { bg: string; text: string }> = {
    connected:  { bg: '#14532d', text: '#4ade80' },
    connecting: { bg: '#1e3a5f', text: '#60a5fa' },
    error:      { bg: '#7f1d1d', text: '#f87171' },
    idle:       { bg: '#1f2937', text: '#9ca3af' },
  };
  const c = colors[status] ?? colors.idle!;

  // Dot pulse animation — flashes bright on each incoming packet
  const pulseOpacity = useRef(new Animated.Value(0.35)).current;
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (lastPacketAt == null) return;
    setIsStale(false);

    pulseOpacity.setValue(1);
    Animated.timing(pulseOpacity, {
      toValue: 0.35,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // If no packet arrives within 2 s, consider the link stale
    const staleTimer = setTimeout(() => setIsStale(true), 2000);
    return () => clearTimeout(staleTimer);
  }, [lastPacketAt]);

  // Green < 150 ms · Amber 150–400 ms · Red > 400 ms or stale
  const dotColor = isStale
    ? '#ef4444'
    : avgLatency == null || avgLatency < 150
      ? '#4ade80'
      : avgLatency < 400
        ? '#fbbf24'
        : '#ef4444';

  const showDot = status === 'connected';

  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {status === 'connecting' && (
        <ActivityIndicator size="small" color={c.text} style={styles.pillSpinner} />
      )}
      {showDot && (
        <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: pulseOpacity }]} />
      )}
      {showDot && avgLatency != null && (
        <Text style={[styles.latencyText, { color: dotColor }]}>{avgLatency}ms</Text>
      )}
      <Text style={[styles.pillText, { color: c.text }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

export default function TelemetryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const { status, refloatValues, error, rxCount, connect, disconnect } = useBleStore();

  useEffect(() => {
    if (id) {
      void connect(id);
    }
    return () => {
      void disconnect();
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    navigation.setOptions({
      title: status === 'connected' ? 'Live Telemetry' : 'Connecting…',
      headerRight: () => <StatusPill status={status} />,
    });
  }, [status, navigation]);

  const isConnected = status === 'connected';
  const v = refloatValues;

  // State decoding: lower 4 bits = state_compat, upper 4 bits = sat_compat
  const stateCompat = v ? (v.state & 0xF) : 0;
  const stateName   = v ? (REFLOAT_STATE_NAMES[stateCompat] ?? `STATE_${stateCompat}`) : '—';
  const hasFault    = v?.hasFault ?? false;
  const faultName   = v?.hasFault
    ? (FAULT_NAMES[v.faultCode] ?? `CODE_${v.faultCode}`)
    : stateName;

  const speedSign = v && v.erpm < 0 ? '-' : '';

  return (
    <View style={styles.container}>
      {status === 'error' && (
        <View style={styles.centerContent}>
          <Text style={styles.disconnectedIcon}>
            {error === 'Board disconnected' ? '⚡' : '✕'}
          </Text>
          <Text style={styles.disconnectedTitle}>
            {error === 'Board disconnected' ? 'Board turned off' : 'Connection failed'}
          </Text>
          {error && error !== 'Board disconnected' && (
            <Text style={styles.errorText}>{error}</Text>
          )}
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryText}>← Back to Scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'connecting' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.connectingText}>Connecting…</Text>
        </View>
      )}

      {isConnected && !v && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.connectingText}>Waiting for telemetry…</Text>
          <Text style={styles.debugText}>Packets received: {rxCount}</Text>
        </View>
      )}

      {isConnected && v && (
        <ScrollView contentContainerStyle={styles.grid}>

          <Text style={styles.sectionLabel}>RIDING</Text>

          <View style={styles.row}>
            <View style={[styles.cardWide, { backgroundColor: '#1f2937' }]}>
              <Text style={styles.label}>Speed</Text>
              <Text style={styles.bigValue}>
                {speedSign}{fmtSpeed(v.speed)}
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
            <TelemetryCard
              label="State"
              value={faultName}
              alert={hasFault || stateCompat >= 6}
            />
            <TelemetryCard
              label="Footpad"
              value={`${v.adc1.toFixed(2)} / ${v.adc2.toFixed(2)}`}
            />
          </View>

          <Text style={styles.sectionLabel}>ELECTRICAL</Text>

          <View style={styles.row}>
            <TelemetryCard
              label="Voltage"
              value={fmt(v.batteryVoltage)}
              unit="V"
            />
            <TelemetryCard
              label="Batt Current"
              value={fmt(v.batteryCurrent)}
              unit="A"
            />
          </View>

          <View style={styles.row}>
            <TelemetryCard
              label="Motor Current"
              value={fmt(v.motorCurrent)}
              unit="A"
            />
            <TelemetryCard
              label="ERPM"
              value={v.erpm.toFixed(0)}
            />
          </View>

          <View style={styles.row}>
            <TelemetryCard
              label="Duty Cycle"
              value={(v.dutyCycle * 100).toFixed(1)}
              unit="%"
              alert={Math.abs(v.dutyCycle) > 0.85}
            />
            <TelemetryCard
              label="Bal. Pitch"
              value={fmt(v.balancePitch)}
              unit="°"
            />
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
                <TelemetryCard
                  label="Total Distance"
                  value={fmtKm(v.odometer)}
                  unit="km"
                />
              </View>
            </>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
    marginRight: 8,
  },
  pillSpinner: {
    transform: [{ scale: 0.7 }],
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  latencyText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1,
  },
  disconnectedIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  disconnectedTitle: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
  },
  retryText: {
    color: '#60a5fa',
    fontWeight: '600',
    fontSize: 15,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  connectingText: {
    color: '#9ca3af',
    fontSize: 16,
  },
  debugText: {
    color: '#4b5563',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  grid: {
    padding: 12,
    paddingBottom: 32,
  },
  sectionLabel: {
    color: '#4b5563',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 2,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  cardWide: {
    borderRadius: 10,
    padding: 14,
    flex: 1,
    margin: 4,
    gap: 6,
  },
  label: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigValue: {
    color: '#f9fafb',
    fontSize: 48,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  bigUnit: {
    color: '#6b7280',
    fontSize: 20,
    fontWeight: '400',
  },
});

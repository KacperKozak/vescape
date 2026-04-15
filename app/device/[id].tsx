import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';

import { useBleStore } from '@/src/store/bleStore';
import { TelemetryCard } from '@/src/components/TelemetryCard';
import { FAULT_NAMES } from '@/src/vesc/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

function fmtPercent(duty: number): string {
  return (duty * 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

type StatusPillProps = { status: string };

function StatusPill({ status }: StatusPillProps) {
  const colors: Record<string, { bg: string; text: string }> = {
    connected:   { bg: '#14532d', text: '#4ade80' },
    connecting:  { bg: '#1e3a5f', text: '#60a5fa' },
    error:       { bg: '#7f1d1d', text: '#f87171' },
    idle:        { bg: '#1f2937', text: '#9ca3af' },
  };
  const c = colors[status] ?? colors.idle!;

  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {status === 'connecting' && (
        <ActivityIndicator size="small" color={c.text} style={styles.pillSpinner} />
      )}
      <Text style={[styles.pillText, { color: c.text }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TelemetryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const { status, values, error, rxCount, connect, disconnect } = useBleStore();

  // Connect on mount, disconnect when leaving
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

  // Update header title once we have a connection
  useEffect(() => {
    navigation.setOptions({
      title: status === 'connected' ? 'Live Telemetry' : 'Connecting…',
    });
  }, [status, navigation]);

  const isConnected = status === 'connected';
  const faultName = values ? (FAULT_NAMES[values.faultCode] ?? `CODE_${values.faultCode}`) : '—';
  const hasFault = values ? values.faultCode !== 0 : false;

  return (
    <SafeAreaView style={styles.container}>
      {/* Status pill */}
      <View style={styles.header}>
        <StatusPill status={status} />
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {/* Retry / back button on error */}
      {status === 'error' && (
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryText}>← Back to Scan</Text>
        </TouchableOpacity>
      )}

      {/* Connecting placeholder */}
      {status === 'connecting' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.connectingText}>Connecting…</Text>
        </View>
      )}

      {/* Connected but waiting for first telemetry packet */}
      {isConnected && !values && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ade80" />
          <Text style={styles.connectingText}>Waiting for telemetry…</Text>
          <Text style={styles.debugText}>Packets received: {rxCount}</Text>
        </View>
      )}

      {/* Telemetry grid */}
      {isConnected && values && (
        <ScrollView contentContainerStyle={styles.grid}>
          <View style={styles.row}>
            <TelemetryCard
              label="Voltage"
              value={fmt(values.voltage)}
              unit="V"
            />
            <TelemetryCard
              label="Input Current"
              value={fmt(values.currentInput)}
              unit="A"
            />
          </View>

          <View style={styles.row}>
            <TelemetryCard
              label="Motor Current"
              value={fmt(values.currentMotor)}
              unit="A"
            />
            <TelemetryCard
              label="ERPM"
              value={values.rpm.toFixed(0)}
            />
          </View>

          <View style={styles.row}>
            <TelemetryCard
              label="Duty Cycle"
              value={fmtPercent(values.dutyCycle)}
              unit="%"
            />
            <TelemetryCard
              label="MOSFET Temp"
              value={fmt(values.tempMosfet)}
              unit="°C"
              alert={values.tempMosfet > 80}
            />
          </View>

          <View style={styles.row}>
            <TelemetryCard
              label="Motor Temp"
              value={values.tempMotor > 0 ? fmt(values.tempMotor) : 'N/A'}
              unit={values.tempMotor > 0 ? '°C' : undefined}
              alert={values.tempMotor > 100}
            />
            <TelemetryCard
              label="Fault"
              value={faultName}
              alert={hasFault}
            />
          </View>

          {/* Secondary row */}
          <View style={styles.row}>
            <TelemetryCard
              label="Amp·Hours"
              value={fmt(values.ampHours, 3)}
              unit="Ah"
            />
            <TelemetryCard
              label="Watt·Hours"
              value={fmt(values.wattHours, 2)}
              unit="Wh"
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  pillSpinner: {
    transform: [{ scale: 0.7 }],
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
  retryButton: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
  },
  retryText: {
    color: '#60a5fa',
    fontWeight: '600',
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
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
});

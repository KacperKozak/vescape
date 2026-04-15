import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  label: string;
  value: string;
  unit?: string;
  /** Highlight the card (e.g. for fault codes) */
  alert?: boolean;
};

/** A single telemetry value tile. */
export function TelemetryCard({ label, value, unit, alert = false }: Props) {
  return (
    <View style={[styles.card, alert && styles.cardAlert]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? (
          <Text style={styles.unit}> {unit}</Text>
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    margin: 4,
    gap: 6,
  },
  cardAlert: {
    backgroundColor: '#7f1d1d',
    borderColor: '#ef4444',
    borderWidth: 1,
  },
  label: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: '#f9fafb',
    fontSize: 24,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  unit: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '400',
  },
});

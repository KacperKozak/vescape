import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  label: string
  value: string
  unit?: string
  /** Small secondary text shown below the value */
  sub?: string
  /** Highlight the card when value warrants attention (fault, over-limit, etc.) */
  alert?: boolean
}

/** A single telemetry value tile. */
export function TelemetryCard({ label, value, unit, sub, alert = false }: Props) {
  return (
    <View style={styles.card}>
      {alert && <View style={styles.alertDot} />}
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
        {sub ? <Text style={styles.sub}> {sub}</Text> : null}
      </Text>
    </View>
  )
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
  alertDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ef4444',
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
  sub: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
  },
})

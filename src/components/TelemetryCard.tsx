import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LightningIcon } from 'phosphor-react-native'

interface Props {
  label: string
  value: string
  unit?: string
  /** Small secondary text shown below the value */
  sub?: string
  /** Highlight the card when value warrants attention (fault, over-limit, etc.) */
  alert?: boolean
  /** Show a green charging indicator (dot + icon) */
  charging?: boolean
}

/** A single telemetry value tile. */
export const TelemetryCard = React.memo(function TelemetryCard({
  label,
  value,
  unit,
  sub,
  alert = false,
  charging = false,
}: Props) {
  return (
    <View style={styles.card}>
      {alert && <View style={styles.alertDot} />}
      {charging && <View style={styles.chargingDot} />}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {charging && <LightningIcon size={11} color="#4ade80" weight="fill" />}
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
        {sub ? <Text style={styles.sub}> {sub}</Text> : null}
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
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
  chargingDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 24,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  unit: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '400',
  },
  sub: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
})

import { useNavigation } from 'expo-router'
import { BellRingingIcon } from 'phosphor-react-native'
import { type ReactNode, useEffect } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { AlertsSection } from './AlertsSection'
import { theme } from '@/constants/theme'

interface Props {
  title: string
  children: ReactNode
  controlId?: string
  unit?: string
  alertControls?: AlertControl[]
  /** When provided, layout renders gauge → alerts → children. Otherwise children → alerts. */
  gauge?: ReactNode
}

interface AlertControl {
  label: string
  controlId: string
  unit: string
}

export function ControlDetailLayout({
  title,
  children,
  controlId,
  unit = '',
  alertControls,
  gauge,
}: Props) {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ title })
  }, [title, navigation])

  const controls = alertControls ?? (controlId ? [{ label: title, controlId, unit }] : [])

  const alerts = (
    <View style={styles.alertsSection}>
      <View style={styles.sectionHeader}>
        <BellRingingIcon size={20} color={theme.highlight.color} weight="duotone" />
        <Text style={styles.sectionLabel}>Alerts</Text>
      </View>
      {controls.length > 0 ? (
        controls.map((control, index) => (
          <View key={control.controlId} style={styles.alertControl}>
            {controls.length > 1 ? (
              <Text style={[styles.alertControlLabel, index > 0 && styles.alertControlLabelGap]}>
                {control.label.toUpperCase()}
              </Text>
            ) : null}
            <AlertsSection controlId={control.controlId} unit={control.unit} />
          </View>
        ))
      ) : (
        <Text style={styles.placeholder}>No alert configuration available.</Text>
      )}
    </View>
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {gauge != null ? (
        <>
          {gauge}
          {alerts}
          {children}
        </>
      ) : (
        <>
          {children}
          {alerts}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  alertsSection: {
    gap: 10,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  alertControl: {
    gap: 8,
  },
  alertControlLabel: {
    color: theme.neutral.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  alertControlLabelGap: {
    marginTop: 8,
  },
  sectionLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  placeholder: {
    color: theme.neutral.textDim,
    fontSize: 14,
  },
})

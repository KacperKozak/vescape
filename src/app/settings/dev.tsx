import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  CaretRightIcon,
  CheckCircleIcon,
  SwatchesIcon,
  TestTubeIcon,
  WarningCircleIcon,
} from 'phosphor-react-native'
import { getDiagnosticStatus, reportDiagnosticTest, type DiagnosticStatus } from 'vesc-ble'

import { reportUiError } from '@/diagnostics/uiDiagnostics'
import { routes } from '@/navigation/routes'

export default function DevSettingsScreen() {
  const [diagnosticStatus, setDiagnosticStatus] = useState<DiagnosticStatus | null>(() => {
    try {
      return getDiagnosticStatus()
    } catch {
      return null
    }
  })
  const [lastResult, setLastResult] = useState<string | null>(null)
  const posthogConfig = useMemo(
    () => ({
      apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '',
    }),
    [],
  )

  const posthogReady = posthogConfig.apiKey.trim().length > 0
  const host = (diagnosticStatus?.host ?? posthogConfig.host.trim()) || 'https://us.i.posthog.com'

  const refreshStatus = (label: string, status: DiagnosticStatus) => {
    setDiagnosticStatus(status)
    setLastResult(`${label} queued at ${new Date().toLocaleTimeString()}`)
  }

  const sendNativeDiagnostic = () => {
    refreshStatus('diagnostic_test', reportDiagnosticTest())
  }

  const sendUiDiagnostic = () => {
    reportUiError(new Error('Manual UI diagnostic test'), 'settings_dev')
    refreshStatus('ui_error', getDiagnosticStatus())
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Tools</Text>

        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push(routes.settingsComponents)}>
            <View style={styles.rowIcon}>
              <SwatchesIcon size={20} color="#94a3b8" weight="duotone" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Component Library</Text>
              <Text style={styles.rowHint}>Browse all UI components with live props</Text>
            </View>
            <CaretRightIcon size={18} color="#64748b" weight="bold" />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>PostHog</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              {posthogReady ? (
                <CheckCircleIcon size={20} color="#22c55e" weight="fill" />
              ) : (
                <WarningCircleIcon size={20} color="#f59e0b" weight="fill" />
              )}
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>
                {diagnosticStatus?.enabled || posthogReady
                  ? 'Diagnostics configured'
                  : 'Diagnostics disabled'}
              </Text>
              <Text style={styles.rowHint} selectable>
                {diagnosticStatus?.enabled || posthogReady
                  ? `Host: ${host}`
                  : 'Set EXPO_PUBLIC_POSTHOG_API_KEY and rebuild the app.'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Manual events</Text>

        <View style={styles.card}>
          <Pressable style={styles.row} onPress={sendNativeDiagnostic}>
            <View style={styles.rowIcon}>
              <TestTubeIcon size={20} color="#94a3b8" weight="duotone" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Send native diagnostic</Text>
              <Text style={styles.rowHint}>Emits diagnostic_test from Kotlin</Text>
            </View>
          </Pressable>

          <View style={styles.separator} />

          <Pressable style={styles.row} onPress={sendUiDiagnostic}>
            <View style={styles.rowIcon}>
              <WarningCircleIcon size={20} color="#94a3b8" weight="duotone" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Send UI diagnostic</Text>
              <Text style={styles.rowHint}>Emits ui_error through the native bridge</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Native status</Text>
          <Text style={styles.resultValue} selectable>
            enabled={String(diagnosticStatus?.enabled ?? false)}
          </Text>
          <Text style={styles.resultValue} selectable>
            distinctId={diagnosticStatus?.distinctId ?? 'none'}
          </Text>
          <Text style={styles.resultValue} selectable>
            captureCount={diagnosticStatus?.captureCount ?? 0}
          </Text>
          <Text style={styles.resultValue} selectable>
            lastEvent={diagnosticStatus?.lastEventName ?? 'none'}
          </Text>
        </View>

        {lastResult ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Last sent</Text>
            <Text style={styles.resultValue} selectable>
              {lastResult}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    color: '#64748b',
    fontSize: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#334155',
    marginLeft: 58,
  },
  resultCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    gap: 4,
  },
  resultLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultValue: {
    color: '#f1f5f9',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
})

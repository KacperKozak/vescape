import { useCallback, useEffect, useState } from 'react'
import { View, Text, Switch, Pressable, StyleSheet, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import {
  ClockCountdownIcon,
  BluetoothConnectedIcon,
  RecordIcon,
  MinusIcon,
  PlusIcon,
  CodeIcon,
  CaretRightIcon,
  DatabaseIcon,
  TagIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'
import { getDatabaseSizeBytes } from 'vesc-ble'

import { routes } from '@/navigation/routes'
import { useSettingsStore } from '@/store/settingsStore'
import { theme } from '@/constants/theme'

const appVersion = Constants.expoConfig?.version ?? '–'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsScreen() {
  const { liveHistoryLimit, autoConnect, autoRecording, set } = useSettingsStore(
    useShallow((s) => ({
      liveHistoryLimit: s.liveHistoryLimit,
      autoConnect: s.autoConnect,
      autoRecording: s.autoRecording,
      set: s.set,
    })),
  )
  const [dbSize, setDbSize] = useState<number | null>(null)

  useEffect(() => {
    getDatabaseSizeBytes()
      .then(setDbSize)
      .catch(() => {})
  }, [])

  const decrementLimit = useCallback(() => {
    if (liveHistoryLimit > 1) void set('liveHistoryLimit', liveHistoryLimit - 1)
  }, [liveHistoryLimit, set])

  const incrementLimit = useCallback(() => {
    if (liveHistoryLimit < 50) void set('liveHistoryLimit', liveHistoryLimit + 1)
  }, [liveHistoryLimit, set])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>Vibe Wheel</Text>
          <View style={styles.headerStats}>
            <View style={styles.headerItem}>
              <TagIcon size={14} color={theme.wheel.color} weight="duotone" />
              <Text style={styles.headerValue}>v{appVersion}</Text>
            </View>
            <View style={styles.headerItem}>
              {Platform.OS === 'ios' ? (
                <AppleLogoIcon size={14} color={theme.target.color} weight="duotone" />
              ) : (
                <AndroidLogoIcon size={14} color={theme.gps.color} weight="duotone" />
              )}
              <Text style={styles.headerValue}>
                {Platform.OS === 'ios' ? 'iOS' : 'Android'} {Platform.Version}
              </Text>
            </View>
            <View style={styles.headerItem}>
              <DatabaseIcon size={14} color={theme.warning.color} weight="duotone" />
              <Text style={styles.headerValue}>{dbSize != null ? formatBytes(dbSize) : '–'}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>General</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <ClockCountdownIcon size={20} color="#94a3b8" weight="duotone" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Live history limit</Text>
              <Text style={styles.rowHint}>Minutes of telemetry visible in live graphs</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable style={styles.stepperBtn} onPress={decrementLimit}>
                <MinusIcon size={14} color="#f1f5f9" weight="bold" />
              </Pressable>
              <Text style={styles.stepperValue}>{liveHistoryLimit}</Text>
              <Pressable style={styles.stepperBtn} onPress={incrementLimit}>
                <PlusIcon size={14} color="#f1f5f9" weight="bold" />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Connection</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <BluetoothConnectedIcon size={20} color="#94a3b8" weight="duotone" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Auto connect</Text>
              <Text style={styles.rowHint}>Connect to board on app start</Text>
            </View>
            <Switch
              value={autoConnect}
              onValueChange={(v) => void set('autoConnect', v)}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={autoConnect ? '#3b82f6' : '#64748b'}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <RecordIcon size={20} color="#94a3b8" weight="fill" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Auto recording</Text>
              <Text style={styles.rowHint}>Start recording when board connects</Text>
            </View>
            <Switch
              value={autoRecording}
              onValueChange={(v) => void set('autoRecording', v)}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={autoRecording ? '#3b82f6' : '#64748b'}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Developer</Text>

        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push(routes.settingsDev)}>
            <View style={styles.rowIcon}>
              <CodeIcon size={20} color="#94a3b8" weight="duotone" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Dev tools</Text>
              <Text style={styles.rowHint}>Diagnostics and local verification</Text>
            </View>
            <CaretRightIcon size={18} color="#64748b" weight="bold" />
          </Pressable>
        </View>
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
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  appName: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 20,
  },
  headerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerValue: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepperBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepperValue: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
})

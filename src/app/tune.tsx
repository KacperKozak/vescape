import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ArrowsClockwiseIcon, WarningCircleIcon } from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getRefloatConfigSnapshot, type RefloatConfigSnapshot } from 'vesc-ble'

type LoadState =
  | { phase: 'loading'; snapshot: RefloatConfigSnapshot | null; error: string | null }
  | { phase: 'ready'; snapshot: RefloatConfigSnapshot; error: null }
  | { phase: 'error'; snapshot: RefloatConfigSnapshot | null; error: string }

function formatValue(value: number | boolean | string): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to read Refloat config.'
}

async function readConfigSnapshotWithTimeout(timeoutMs = 9000): Promise<RefloatConfigSnapshot> {
  return Promise.race([
    getRefloatConfigSnapshot(),
    new Promise<RefloatConfigSnapshot>((_, reject) => {
      setTimeout(() => reject(new Error('Timed out reading board config.')), timeoutMs)
    }),
  ])
}

export default function TuneScreen() {
  const [state, setState] = useState<LoadState>({
    phase: 'loading',
    snapshot: null,
    error: null,
  })

  const load = useCallback(async () => {
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await readConfigSnapshotWithTimeout()
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const snapshot = state.snapshot

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tune</Text>
          <Text style={styles.subtitle}>Read-only Refloat config</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={load} disabled={state.phase === 'loading'}>
          <ArrowsClockwiseIcon size={18} color="#e5e7eb" />
        </Pressable>
      </View>

      {state.phase === 'loading' && !snapshot ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>Reading board config...</Text>
        </View>
      ) : null}

      {state.phase === 'error' && !snapshot ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <ScrollView contentContainerStyle={styles.content}>
          {state.phase === 'error' ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{state.error}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>CAN {snapshot.canId}</Text>
            <Text style={styles.metaText}>{snapshot.rawConfigLength} bytes</Text>
            {snapshot.missingFieldIds.length > 0 ? (
              <Text style={styles.metaText}>{snapshot.missingFieldIds.length} missing</Text>
            ) : null}
          </View>

          {snapshot.groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupCount}>{group.fields.length} values</Text>
              </View>
              {group.fields.map((field) => (
                <View key={field.id} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <View style={styles.valueBox}>
                    <Text style={styles.fieldValue}>{formatValue(field.value)}</Text>
                    {field.unit ? <Text style={styles.fieldUnit}>{field.unit}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  title: {
    color: '#f9fafb',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9ca3af',
    marginTop: 4,
    fontSize: 14,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
  },
  content: {
    padding: 16,
    gap: 18,
    paddingBottom: 32,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    color: '#9ca3af',
    fontSize: 15,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#020617',
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#3f1111',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    color: '#fecaca',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#9ca3af',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
  },
  group: {
    gap: 12,
  },
  groupHeader: {
    backgroundColor: '#18181b',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  groupTitle: {
    color: '#f4f4f5',
    fontSize: 20,
    fontWeight: '700',
  },
  groupCount: {
    color: '#a1a1aa',
    marginTop: 3,
    fontSize: 13,
  },
  fieldRow: {
    gap: 6,
  },
  fieldLabel: {
    color: '#f4f4f5',
    fontSize: 16,
  },
  valueBox: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: '#242424',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    color: '#f5f5f5',
    fontSize: 18,
    fontWeight: '600',
  },
  fieldUnit: {
    color: '#d4d4d8',
    fontSize: 16,
    marginLeft: 12,
  },
})

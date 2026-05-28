import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { type TuneHistoryEntry, type TuneProfileFieldValue } from 'vesc-ble'

import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { APP_TUNE_FIELD_BY_ID, formatTuneValue } from '@/lib/tune/fields'
import { useTuneProfileStore } from '@/store/tuneProfileStore'
import { theme } from '@/constants/theme'

interface HistoryFieldDiff {
  fieldId: string
  label: string
  oldValue: string
  newValue: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatHistoryDate(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${h}:${m}`
}

function diffHistoryEntries(
  newer: { fields: Record<string, TuneProfileFieldValue> },
  older: { fields: Record<string, TuneProfileFieldValue> },
): HistoryFieldDiff[] {
  const diffs: HistoryFieldDiff[] = []
  const allKeys = new Set([...Object.keys(newer.fields), ...Object.keys(older.fields)])
  for (const key of allKeys) {
    const nv = newer.fields[key]
    const ov = older.fields[key]
    if (nv === ov) continue
    if (typeof nv === 'number' && typeof ov === 'number' && Object.is(nv, ov)) continue
    const label = APP_TUNE_FIELD_BY_ID.get(key)?.label ?? key
    diffs.push({
      fieldId: key,
      label,
      oldValue:
        ov != null && ov !== '' ? String(typeof ov === 'number' ? formatTuneValue(ov) : ov) : '–',
      newValue:
        nv != null && nv !== '' ? String(typeof nv === 'number' ? formatTuneValue(nv) : nv) : '–',
    })
  }
  return diffs
}

export default function TuneHistoryScreen() {
  const router = useRouter()
  const activeProfile = useTuneProfileStore((s) => s.activeProfile)
  const loadHistory = useTuneProfileStore((s) => s.loadHistory)
  const rollbackToHistory = useTuneProfileStore((s) => s.rollbackToHistory)
  const currentFields = useTuneProfileStore((s) => s.activeProfile?.fields)

  const [entries, setEntries] = useState<TuneHistoryEntry[]>([])
  const [rollbackConfirmEntryId, setRollbackConfirmEntryId] = useState<number | null>(null)

  useEffect(() => {
    if (!activeProfile) return
    void loadHistory(activeProfile.id).then(setEntries)
  }, [activeProfile, loadHistory])

  const handleRestore = useCallback((entryId: number) => {
    setRollbackConfirmEntryId(entryId)
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {entries.length === 0 ? (
        <Text style={styles.empty}>No history entries yet.</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const newer =
              index === 0 && currentFields ? { fields: currentFields } : entries[index - 1]
            const diffs = newer ? diffHistoryEntries(newer, item) : []
            const isOldest = index === entries.length - 1
            return (
              <View style={styles.entry}>
                <View style={styles.entryInfo}>
                  <Text style={styles.entryDate}>{formatHistoryDate(item.createdAt)}</Text>
                  {diffs.length > 0 ? (
                    <View style={styles.diffs}>
                      {diffs.map((d) => (
                        <Text key={d.fieldId} style={styles.diffLine} numberOfLines={1}>
                          {d.label} <Text style={styles.diffOld}>{d.oldValue}</Text>
                          {' → '}
                          <Text style={styles.diffNew}>{d.newValue}</Text>
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.entryDetail}>
                      {isOldest ? 'Initial save' : 'No changes'}
                    </Text>
                  )}
                </View>
                <Pressable style={styles.restoreButton} onPress={() => handleRestore(item.id)}>
                  <ArrowCounterClockwiseIcon size={13} color={theme.wheel.color} weight="bold" />
                  <Text style={styles.restoreText}>Restore</Text>
                </Pressable>
              </View>
            )
          }}
        />
      )}
      <ConfirmModal
        visible={rollbackConfirmEntryId != null}
        title="Restore"
        message="Replace current profile fields with this snapshot?"
        confirmLabel="Restore"
        onConfirm={() => {
          if (rollbackConfirmEntryId != null) {
            void rollbackToHistory(rollbackConfirmEntryId).then(() => router.back())
          }
          setRollbackConfirmEntryId(null)
        }}
        onCancel={() => setRollbackConfirmEntryId(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  empty: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.neutral.surface,
    gap: 10,
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryDate: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  entryDetail: {
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  diffs: {
    gap: 1,
    marginTop: 2,
  },
  diffLine: {
    color: theme.neutral.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  diffOld: {
    color: theme.error.text,
    fontWeight: '700',
  },
  diffNew: {
    color: theme.gps.text,
    fontWeight: '700',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0c2537',
    borderWidth: 1,
    borderColor: '#164e63',
  },
  restoreText: {
    color: theme.wheel.color,
    fontSize: 11,
    fontWeight: '800',
  },
})

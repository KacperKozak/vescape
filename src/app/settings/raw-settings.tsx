import { useMemo } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BracketsCurlyIcon, ExportIcon } from 'phosphor-react-native'

import { IconHero } from '@/components/ui/settings/IconHero'
import { theme } from '@/constants/theme'
import { tokenizeJson, type JsonTokenType } from '@/helpers/jsonHighlight'
import { useBoardStore } from '@/store/boardStore'
import { useSettingsStore } from '@/store/settingsStore'

// Store keys that are actions/flags, not persisted setting data.
const APP_STORE_OMIT = new Set(['loaded', 'load', 'set', 'setCompanionPresence'])

const TOKEN_COLORS: Record<JsonTokenType, string> = {
  key: theme.palette.sky.light,
  string: theme.palette.green.light,
  number: theme.palette.amber.light,
  boolean: theme.palette.purple.thunder,
  null: theme.palette.red.light,
  punctuation: theme.palette.slate.textMuted,
  plain: theme.palette.slate.textSecondary,
}

function pickData(source: Record<string, unknown>, omit: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (omit.has(key) || typeof value === 'function') continue
    out[key] = value
  }
  return out
}

export default function RawSettingsScreen() {
  const settingsState = useSettingsStore()
  const boards = useBoardStore((s) => s.boards)
  const activeBoardId = useBoardStore((s) => s.activeBoardId)

  const appData = useMemo(
    () => pickData(settingsState as unknown as Record<string, unknown>, APP_STORE_OMIT),
    [settingsState],
  )
  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={BracketsCurlyIcon}
          description="Raw app settings and current board record, exactly as stored."
        />

        <RawSection title="App settings" data={appData} exportName="app-settings" />

        <RawSection
          title={activeBoard ? `Active board · ${activeBoard.name}` : 'Active board'}
          data={activeBoard}
          exportName="board"
          empty="No board selected"
        />
      </ScrollView>
    </SafeAreaView>
  )
}

interface RawSectionProps {
  title: string
  data: unknown
  exportName: string
  empty?: string
}

function RawSection({ title, data, exportName, empty }: RawSectionProps) {
  const entries =
    data && typeof data === 'object' ? Object.entries(data as Record<string, unknown>) : []

  const handleExport = () => {
    Share.share({ message: JSON.stringify(data, null, 2) }, { subject: `${exportName}.json` })
  }

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {entries.length > 0 ? (
          <Pressable style={styles.exportButton} onPress={handleExport} hitSlop={8}>
            <ExportIcon size={14} color={theme.palette.sky.light} weight="bold" />
            <Text style={styles.exportText}>Export JSON</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.card}>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>{empty ?? 'No data'}</Text>
        ) : (
          entries.map(([key, value]) => {
            const isObject = value !== null && typeof value === 'object'
            return (
              <View key={key} style={isObject ? styles.kvColumn : styles.kvRow}>
                <Text style={styles.kvKey} selectable>
                  {key}
                </Text>
                <JsonValue value={value} block={isObject} />
              </View>
            )
          })
        )}
      </View>
    </>
  )
}

function JsonValue({ value, block }: { value: unknown; block?: boolean }) {
  const tokens = useMemo(() => tokenizeJson(value), [value])
  return (
    <Text style={block ? styles.jsonBlock : styles.kvValue} selectable>
      {tokens.map((token, i) => (
        <Text key={i} style={{ color: TOKEN_COLORS[token.type] }}>
          {token.text}
        </Text>
      ))}
    </Text>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surface,
  },
  exportText: {
    color: theme.palette.sky.light,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    overflow: 'hidden',
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.palette.slate.border,
  },
  kvColumn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.palette.slate.border,
  },
  jsonBlock: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  kvKey: {
    flex: 1,
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  kvValue: {
    flex: 1,
    fontSize: 12,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
  emptyText: {
    color: theme.palette.slate.textDim,
    fontSize: 13,
    padding: 14,
  },
})

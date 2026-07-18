import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { Text } from '@/components/base/Text'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import {
  PlayIcon,
  SpeakerHighIcon,
  StopIcon,
  ToolboxIcon,
  VibrateIcon,
} from 'phosphor-react-native'

import { TuneDial } from '@/modules/tune/components/TuneDial'
import { IconHero } from '@/components/settings/IconHero'
import { theme } from '@/constants/theme'
import {
  type AlertPreset,
  clearAllBoardWarnings,
  devInjectBoardWarning,
  devReportCleanBoardWarning,
  getAlertPresets,
  previewAlertSound,
  startGeigerSimulation,
  stopGeigerSimulation,
} from 'vescape-core'

import { useBoardStore } from '@/modules/board/store/boardStore'
import { EMPTY_WARNINGS, useBoardWarningsStore } from '@/modules/board/store/boardWarningsStore'

/** Fake kind used by the dev warning injector; real detector kinds land in later slices. */
const DEV_WARNING_KIND = 'cell-spread'
/** Board id used when no board is selected, so the pipe is demoable without a saved board. */
const DEV_WARNING_BOARD_ID = 'dev-board'

const androidHaptics = Object.values(Haptics.AndroidHaptics).map((type) => ({
  label: type
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' '),
  type,
}))

type PlaybackMode = 'single' | 'geiger'

const TTS_EXAMPLES = [
  'Battery {voltage} volts, {percent}%',
  '{value} {unit}',
  'Warning! {value} {unit}',
]

export default function OtherSettingsScreen() {
  const presets = useMemo(() => getAlertPresets(), [])
  const singlePresets = useMemo(
    () => presets.filter((preset) => preset.category === 'single'),
    [presets],
  )
  const geigerPresets = useMemo(
    () => presets.filter((preset) => preset.category === 'geiger'),
    [presets],
  )
  const [selectedUri, setSelectedUri] = useState<string>(singlePresets[0]?.uri ?? 'preset:beep')
  const [mode, setMode] = useState<PlaybackMode>('single')
  const [rangeDepth, setRangeDepth] = useState(0.5)
  const [geigerActive, setGeigerActive] = useState(false)
  const [ttsTemplate, setTtsTemplate] = useState('Battery {voltage} volts, {percent}%')

  const visiblePresets = mode === 'single' ? singlePresets : geigerPresets
  const selectedPreset = visiblePresets.find((p) => p.uri === selectedUri) ?? visiblePresets[0]

  useEffect(() => {
    return () => stopGeigerSimulation()
  }, [])

  const handlePlaySingle = useCallback(() => {
    previewAlertSound(selectedUri)
  }, [selectedUri])

  const handleStopGeiger = useCallback(() => {
    stopGeigerSimulation()
    setGeigerActive(false)
  }, [])

  const handleToggleGeiger = useCallback(() => {
    if (geigerActive) {
      stopGeigerSimulation()
      setGeigerActive(false)
    } else {
      startGeigerSimulation(selectedUri, rangeDepth)
      setGeigerActive(true)
    }
  }, [geigerActive, selectedUri, rangeDepth])

  const handleRangeDepthChange = useCallback(
    (value: number) => {
      setRangeDepth(value)
      if (geigerActive) {
        startGeigerSimulation(selectedUri, value)
      }
    },
    [geigerActive, selectedUri],
  )

  const handleSpeakTts = useCallback(() => {
    previewAlertSound(`tts:${ttsTemplate}`)
  }, [ttsTemplate])

  const warningBoardId = useBoardStore((s) => s.activeBoardId) ?? DEV_WARNING_BOARD_ID
  const boardWarnings = useBoardWarningsStore(
    (s) => s.warningsByBoard[warningBoardId] ?? EMPTY_WARNINGS,
  )

  const injectWarning = useCallback(
    (severity: 'warn' | 'critical') => {
      const payload = JSON.stringify({
        peakSpread: severity === 'critical' ? 0.27 : 0.12,
        worstGroup: 4,
        injectedAt: Date.now(),
      })
      void devInjectBoardWarning(warningBoardId, DEV_WARNING_KIND, severity, payload)
    },
    [warningBoardId],
  )

  const reportClean = useCallback(() => {
    void devReportCleanBoardWarning(warningBoardId, DEV_WARNING_KIND)
  }, [warningBoardId])

  const clearWarnings = useCallback(() => {
    void clearAllBoardWarnings(warningBoardId)
  }, [warningBoardId])

  function selectMode(next: PlaybackMode) {
    if (geigerActive) handleStopGeiger()
    setMode(next)
    const nextPresets = next === 'single' ? singlePresets : geigerPresets
    setSelectedUri(nextPresets[0]?.uri ?? 'preset:beep')
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={ToolboxIcon} description="Small platform probes and local experiments." />

        <Text style={styles.sectionTitle}>Board Warnings</Text>
        <View style={styles.card}>
          <Text style={styles.ttsHint}>
            Injects a fake warning through the native registry (fire → persist → emit). Target
            board: {warningBoardId}
          </Text>
          <View style={styles.warningButtonRow}>
            <Pressable
              style={[styles.warningButton, styles.warningButtonWarn]}
              onPress={() => injectWarning('warn')}
            >
              <Text style={styles.warningButtonText}>Inject warn</Text>
            </Pressable>
            <Pressable
              style={[styles.warningButton, styles.warningButtonCritical]}
              onPress={() => injectWarning('critical')}
            >
              <Text style={styles.warningButtonText}>Inject critical</Text>
            </Pressable>
          </View>
          <View style={styles.warningButtonRow}>
            <Pressable style={styles.warningButton} onPress={reportClean}>
              <Text style={styles.warningButtonText}>Report clean</Text>
            </Pressable>
            <Pressable style={styles.warningButton} onPress={clearWarnings}>
              <Text style={styles.warningButtonText}>Clear all</Text>
            </Pressable>
          </View>
          {boardWarnings.length === 0 ? (
            <Text style={styles.warningEmpty}>No warnings (mirror store empty)</Text>
          ) : (
            boardWarnings.map((warning) => (
              <View key={warning.kind} style={styles.warningRow}>
                <Text style={styles.warningRowKind}>
                  {warning.kind} · {warning.severity}
                </Text>
                <Text style={styles.warningRowPayload} numberOfLines={1}>
                  {warning.payloadJson}
                </Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Haptics</Text>
        <View style={styles.plainCard}>
          {Platform.OS === 'android' ? (
            <View style={styles.controlGroup}>
              <View style={styles.controlHeader}>
                <View style={styles.rowIcon}>
                  <VibrateIcon size={20} color={theme.palette.sky.color} weight="duotone" />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowLabel}>Android haptics</Text>
                  <Text style={styles.rowHint}>Native performHapticFeedback constants</Text>
                </View>
              </View>
              <View style={styles.hapticGrid}>
                {androidHaptics.map((haptic) => (
                  <Pressable
                    key={haptic.type}
                    style={styles.hapticButton}
                    onPress={() => Haptics.performAndroidHapticsAsync(haptic.type)}
                  >
                    <Text style={styles.hapticButtonText}>{haptic.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : Platform.OS === 'web' ? (
            <View style={styles.row}>
              <Text style={styles.rowHint}>Haptics not available on web</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={styles.rowHint}>Android haptic controls only</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Sound Preset</Text>
        <View style={styles.card}>
          <View style={styles.presetGrid}>
            {visiblePresets.map((preset) => (
              <PresetButton
                key={preset.uri}
                preset={preset}
                selected={selectedUri === preset.uri}
                onPress={() => {
                  if (geigerActive) handleStopGeiger()
                  setSelectedUri(preset.uri)
                }}
              />
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Playback Mode</Text>
        <View style={styles.card}>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, mode === 'single' && styles.modeButtonActive]}
              onPress={() => selectMode('single')}
            >
              <Text style={[styles.modeText, mode === 'single' && styles.modeTextActive]}>
                Single Play
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'geiger' && styles.modeButtonActive]}
              onPress={() => selectMode('geiger')}
            >
              <Text style={[styles.modeText, mode === 'geiger' && styles.modeTextActive]}>
                Geiger Simulation
              </Text>
            </Pressable>
          </View>
        </View>

        {mode === 'single' ? (
          <>
            <Text style={styles.sectionTitle}>Play</Text>
            <View style={styles.card}>
              <Pressable style={styles.playButton} onPress={handlePlaySingle}>
                <PlayIcon size={20} color={theme.palette.sky.bg} weight="fill" />
                <Text style={styles.playButtonText}>
                  Play {selectedPreset?.name ?? selectedUri}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Geiger Simulation</Text>
            <View style={styles.card}>
              <View style={styles.dialSection}>
                <View style={styles.dialHeader}>
                  <Text style={styles.dialLabel}>Range Depth</Text>
                  <Text style={styles.dialValue}>{rangeDepth.toFixed(2)}</Text>
                </View>
                <TuneDial
                  value={rangeDepth}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleRangeDepthChange}
                />
              </View>

              <Pressable
                style={[styles.playButton, geigerActive && styles.stopButton]}
                onPress={handleToggleGeiger}
              >
                {geigerActive ? (
                  <StopIcon size={20} color={theme.palette.slate.textPrimary} weight="fill" />
                ) : (
                  <PlayIcon size={20} color={theme.palette.sky.bg} weight="fill" />
                )}
                <Text style={[styles.playButtonText, geigerActive && styles.stopButtonText]}>
                  {geigerActive ? 'Stop' : 'Start Geiger'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Message Alert (TTS)</Text>
        <View style={styles.card}>
          <Text style={styles.ttsHint}>
            Placeholders: {'{value}'} {'{threshold}'} {'{unit}'} — battery only: {'{voltage}'}{' '}
            {'{percent}'}
          </Text>
          <View style={styles.ttsExamples}>
            {TTS_EXAMPLES.map((ex) => (
              <Pressable
                key={ex}
                style={[styles.ttsChip, ttsTemplate === ex && styles.ttsChipActive]}
                onPress={() => setTtsTemplate(ex)}
              >
                <Text style={[styles.ttsChipText, ttsTemplate === ex && styles.ttsChipTextActive]}>
                  {ex}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.ttsInput}
            value={ttsTemplate}
            onChangeText={setTtsTemplate}
            placeholder="Enter template…"
            placeholderTextColor={theme.palette.slate.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.playButton} onPress={handleSpeakTts}>
            <SpeakerHighIcon size={20} color={theme.palette.sky.bg} weight="fill" />
            <Text style={styles.playButtonText}>Speak</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

interface PresetButtonProps {
  preset: AlertPreset
  selected: boolean
  onPress: () => void
}

function PresetButton({ preset, selected, onPress }: PresetButtonProps) {
  return (
    <Pressable
      style={[styles.presetButton, selected && styles.presetButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.presetName, selected && styles.presetNameActive]}>{preset.name}</Text>
      <Text style={styles.presetCategory}>{preset.category}</Text>
    </Pressable>
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
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
  plainCard: {
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    overflow: 'hidden',
    padding: 14,
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
    backgroundColor: theme.palette.slate.surfaceDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
  },
  controlGroup: {
    padding: 14,
    gap: 12,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hapticGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hapticButton: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hapticButtonText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  presetButtonActive: {
    borderColor: theme.palette.sky.color,
    backgroundColor: theme.palette.sky.bg,
  },
  presetName: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  presetNameActive: {
    color: theme.palette.slate.textPrimary,
  },
  presetCategory: {
    color: theme.palette.slate.textDim,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 0,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  modeButtonActive: {
    backgroundColor: theme.palette.sky.bg,
  },
  modeText: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  modeTextActive: {
    color: theme.palette.slate.textPrimary,
  },
  playButton: {
    backgroundColor: theme.palette.sky.color,
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playButtonText: {
    color: theme.palette.sky.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: theme.status.error.color,
  },
  stopButtonText: {
    color: theme.palette.slate.textPrimary,
  },
  ttsHint: {
    color: theme.palette.slate.textDim,
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
  },
  ttsExamples: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  ttsChip: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ttsChipActive: {
    borderColor: theme.palette.sky.color,
    backgroundColor: theme.palette.sky.bg,
  },
  ttsChipText: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  ttsChipTextActive: {
    color: theme.palette.slate.textPrimary,
  },
  ttsInput: {
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  dialSection: {
    gap: 8,
    marginBottom: 14,
  },
  dialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dialLabel: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  warningButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  warningButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    borderRadius: 8,
    paddingVertical: 12,
  },
  warningButtonWarn: {
    borderColor: theme.status.warning.color,
  },
  warningButtonCritical: {
    borderColor: theme.status.error.color,
  },
  warningButtonText: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  warningEmpty: {
    color: theme.palette.slate.textDim,
    fontSize: 12,
    marginTop: 12,
  },
  warningRow: {
    marginTop: 12,
    gap: 2,
  },
  warningRowKind: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  warningRowPayload: {
    color: theme.palette.slate.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  dialValue: {
    color: theme.palette.sky.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
})

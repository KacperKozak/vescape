import { type ReactNode, useState } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { TuneProfileFieldValue } from 'vescape-core'

import { Text } from '@/components/base/Text'
import { InfoModal } from '@/components/modals/InfoModal'
import { theme } from '@/constants/theme'
import { DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS } from '@/modules/tune/lib/tunePreview'
import { TunePreview } from '@/modules/tune/components/TunePreview'
import {
  TunePreviewScenarioControls,
  type HillsPresetId,
} from '@/modules/tune/components/TunePreviewScenarioControls'
import { useResolvedNeutralColors } from '@/hooks/useTheme'

let previewHelpShownThisSession = false
const PREVIEW_PINNED_GRADIENT_HEIGHT = 210

interface TunePreviewSectionProps {
  fields: Record<string, TuneProfileFieldValue>
  active: boolean
  visible: boolean
  children: ReactNode
}

export function TunePreviewSection({ fields, active, visible, children }: TunePreviewSectionProps) {
  const neutral = useResolvedNeutralColors()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const pitchInputDegrees = useSharedValue(0)
  const pitchInputActive = useSharedValue(false)
  const previewSpeedKmh = useSharedValue(15)
  const groundToBoardAngleDegrees = useSharedValue(0)
  const previewGradientColor = neutral.bg
  const previewGradientColors = [
    theme.alpha(previewGradientColor, 1),
    theme.alpha(previewGradientColor, 0.75),
    theme.alpha(previewGradientColor, 0),
  ]
  const [hillsPreset, setHillsPreset] = useState<HillsPresetId>('flat')
  const [hillHeightMeters, setHillHeightMeters] = useState(2.5)
  const [hillSpacingMeters, setHillSpacingMeters] = useState(30)
  const [previewPinnedHeight, setPreviewPinnedHeight] = useState(PREVIEW_PINNED_GRADIENT_HEIGHT)
  const hillLoadAmps = useSharedValue(0)
  const hillsEnabled = hillsPreset !== 'flat'
  const [advancedPhysics, setAdvancedPhysics] = useState(DEFAULT_TUNE_PREVIEW_ADVANCED_PHYSICS)
  const [previewHelpVisible, setPreviewHelpVisible] = useState(() => {
    if (previewHelpShownThisSession) return false
    previewHelpShownThisSession = true
    return true
  })

  if (!visible) return null

  return (
    <View style={styles.tuneView}>
      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        contentInsetAdjustmentBehavior="automatic"
        stickyHeaderIndices={[0]}
      >
        <View
          style={styles.previewPinned}
          onLayout={(event) => setPreviewPinnedHeight(event.nativeEvent.layout.height)}
        >
          <Canvas style={styles.previewGradient} pointerEvents="none">
            <Rect x={0} y={0} width={width} height={previewPinnedHeight}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, previewPinnedHeight)}
                colors={previewGradientColors}
                positions={[0, 0.7, 1]}
              />
            </Rect>
          </Canvas>
          <TunePreview
            fields={fields}
            pitchInputDegrees={pitchInputDegrees}
            pitchInputActive={pitchInputActive}
            hillsEnabled={hillsEnabled}
            hillHeightMeters={hillHeightMeters}
            hillSpacingMeters={hillSpacingMeters}
            advancedPhysics={advancedPhysics}
            active={active}
            onHelp={() => setPreviewHelpVisible(true)}
            hillLoadAmps={hillLoadAmps}
            speedKmh={previewSpeedKmh}
            groundToBoardAngleDegrees={groundToBoardAngleDegrees}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.previewOptionsHeader}>
            <Text style={styles.previewOptionsTitle}>Preview options</Text>
          </View>
          <TunePreviewScenarioControls
            advancedPhysics={advancedPhysics}
            onAdvancedPhysicsChange={setAdvancedPhysics}
            hillsPreset={hillsPreset}
            onHillsPresetChange={setHillsPreset}
            hillHeightMeters={hillHeightMeters}
            onHillHeightChange={setHillHeightMeters}
            hillSpacingMeters={hillSpacingMeters}
            onHillSpacingChange={setHillSpacingMeters}
            hillsEnabled={hillsEnabled}
            hillLoadAmps={hillLoadAmps}
            pitchInputDegrees={pitchInputDegrees}
            pitchInputActive={pitchInputActive}
            speedKmh={previewSpeedKmh}
            groundToBoardAngleDegrees={groundToBoardAngleDegrees}
          />
          {children}
        </View>
      </ScrollView>

      <InfoModal
        visible={previewHelpVisible}
        variant="warning"
        title="Work in progress"
        message={`Tune Editor is a work in progress and is the only place in this app that can change your board's settings.\n\nTune Preview is not a real-world simulation and will never perfectly represent how your board will behave while riding. It is only a comparison tool to help you understand tune behavior and differences between settings.`}
        onDismiss={() => setPreviewHelpVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  tuneView: { flex: 1 },
  formScroll: { flex: 1 },
  previewPinned: {
    paddingTop: 0,
    paddingBottom: 0,
    gap: 5,
    overflow: 'hidden',
    zIndex: 1,
  },
  previewGradient: {
    position: 'absolute',
    inset: 0,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  previewOptionsHeader: {
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewOptionsTitle: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})

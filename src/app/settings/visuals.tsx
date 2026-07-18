import { ScrollView, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ImageSquareIcon, MapPinIcon, SlidersHorizontalIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { IconHero } from '@/components/ui/settings/IconHero'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { Stepper } from '@/components/ui/forms/Stepper'
import { theme } from '@/constants/theme'
import { DEFAULT_SATELLITE_IMAGERY_OPACITY } from '@/constants/satelliteDarkMapStyle'
import { useSettingsStore } from '@/store/settingsStore'

export default function MapVisualsSettingsScreen() {
  const { satelliteImageryOpacity, satelliteOverlayStreetLinesEnabled, set } = useSettingsStore(
    useShallow((s) => ({
      satelliteImageryOpacity: s.satelliteImageryOpacity,
      satelliteOverlayStreetLinesEnabled: s.satelliteOverlayStreetLinesEnabled,
      set: s.set,
    })),
  )
  const satelliteOpacityPercent = Math.round(satelliteImageryOpacity * 100)
  const satelliteOverlayEnabled = satelliteOpacityPercent < 100

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={ImageSquareIcon}
          description="Tune satellite overlay without changing routes or pins."
        />

        <SettingsSectionTitle>Satellite view</SettingsSectionTitle>
        <SettingsCard>
          <SettingsRow
            icon={SlidersHorizontalIcon}
            iconColor={theme.palette.sky.color}
            label="Satellite overlay"
            hint="Use the toned satellite image with One Dark labels"
            right={
              <Switch
                value={satelliteOverlayEnabled}
                onValueChange={(enabled) => {
                  void set(
                    'satelliteImageryOpacity',
                    enabled ? DEFAULT_SATELLITE_IMAGERY_OPACITY : 1,
                  )
                }}
                trackColor={{
                  false: theme.palette.slate.border,
                  true: theme.palette.sky.border,
                }}
                thumbColor={
                  satelliteOverlayEnabled ? theme.palette.sky.color : theme.palette.slate.textMuted
                }
              />
            }
          />
          {satelliteOverlayEnabled ? (
            <>
              <SettingsRow
                icon={ImageSquareIcon}
                iconColor={theme.palette.cyan.color}
                label="Satellite image opacity"
                hint="Applies on the home telemetry map; Explore uses a clearer satellite overlay"
                right={
                  <Stepper
                    value={satelliteOpacityPercent}
                    unit="%"
                    min={10}
                    max={95}
                    step={5}
                    onChange={(nextPercent) => {
                      const percent = Math.min(95, Math.max(10, nextPercent))
                      void set('satelliteImageryOpacity', percent / 100)
                    }}
                  />
                }
              />
              <SettingsRow
                icon={MapPinIcon}
                iconColor={theme.palette.green.color}
                label="Street lines"
                hint="Draw additional One Dark street lines over the toned satellite image"
                right={
                  <Switch
                    value={satelliteOverlayStreetLinesEnabled}
                    onValueChange={(enabled) =>
                      void set('satelliteOverlayStreetLinesEnabled', enabled)
                    }
                    trackColor={{
                      false: theme.palette.slate.border,
                      true: theme.palette.green.border,
                    }}
                    thumbColor={
                      satelliteOverlayStreetLinesEnabled
                        ? theme.palette.green.color
                        : theme.palette.slate.textMuted
                    }
                  />
                }
              />
            </>
          ) : null}
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
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
})

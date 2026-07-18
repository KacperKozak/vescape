import { ScrollView, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ImageSquareIcon,
  MapPinIcon,
  MapTrifoldIcon,
  PaletteIcon,
  SlidersHorizontalIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { IconHero } from '@/components/ui/settings/IconHero'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { Stepper } from '@/components/ui/forms/Stepper'
import { theme } from '@/constants/theme'
import { useSettingsStore } from '@/store/settingsStore'

export default function MapVisualsSettingsScreen() {
  const {
    satelliteOverlayEnabled,
    satelliteImageryOpacity,
    satelliteMapImageryOpacity,
    satelliteImagerySaturation,
    hideTelemetryMapDetails,
    set,
  } = useSettingsStore(
    useShallow((s) => ({
      satelliteOverlayEnabled: s.satelliteOverlayEnabled,
      satelliteImageryOpacity: s.satelliteImageryOpacity,
      satelliteMapImageryOpacity: s.satelliteMapImageryOpacity,
      satelliteImagerySaturation: s.satelliteImagerySaturation,
      hideTelemetryMapDetails: s.hideTelemetryMapDetails,
      set: s.set,
    })),
  )
  const satelliteOpacityPercent = Math.round(satelliteImageryOpacity * 100)
  const satelliteMapOpacityPercent = Math.round(satelliteMapImageryOpacity * 100)
  const satelliteDesaturationPercent = Math.round(-satelliteImagerySaturation * 100)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={ImageSquareIcon}
          description="Tune map detail and satellite overlay without changing routes or pins."
        />

        <SettingsSectionTitle>General</SettingsSectionTitle>
        <SettingsCard>
          <SettingsRow
            icon={MapPinIcon}
            iconColor={theme.palette.sky.color}
            label="Hide telemetry map details"
            hint="Hide POI names and icons on the home map; Explore still shows full detail"
            right={
              <Switch
                value={hideTelemetryMapDetails}
                onValueChange={(enabled) => void set('hideTelemetryMapDetails', enabled)}
                trackColor={{
                  false: theme.palette.slate.border,
                  true: theme.palette.sky.border,
                }}
                thumbColor={
                  hideTelemetryMapDetails ? theme.palette.sky.color : theme.palette.slate.textMuted
                }
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Satellite view</SettingsSectionTitle>
        <SettingsCard>
          <SettingsRow
            icon={ImageSquareIcon}
            iconColor={theme.palette.sky.color}
            label="Satellite overlay"
            hint="Use the toned satellite image with One Dark labels"
            right={
              <Switch
                value={satelliteOverlayEnabled}
                onValueChange={(enabled) => void set('satelliteOverlayEnabled', enabled)}
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
                icon={SlidersHorizontalIcon}
                iconColor={theme.palette.cyan.color}
                label="Home image opacity"
                hint="Applies on the home telemetry map; Explore uses a clearer satellite overlay"
                right={
                  <Stepper
                    value={satelliteOpacityPercent}
                    unit="%"
                    min={10}
                    max={100}
                    step={5}
                    onChange={(nextPercent) => {
                      const percent = Math.min(100, Math.max(10, nextPercent))
                      void set('satelliteImageryOpacity', percent / 100)
                    }}
                  />
                }
              />
              <SettingsRow
                icon={MapTrifoldIcon}
                iconColor={theme.palette.violet.color}
                label="Explore image opacity"
                hint="Applies inside the full map Satellite view"
                right={
                  <Stepper
                    value={satelliteMapOpacityPercent}
                    unit="%"
                    min={10}
                    max={100}
                    step={5}
                    onChange={(nextPercent) => {
                      const percent = Math.min(100, Math.max(10, nextPercent))
                      void set('satelliteMapImageryOpacity', percent / 100)
                    }}
                  />
                }
              />
              <SettingsRow
                icon={PaletteIcon}
                iconColor={theme.palette.purple.color}
                label="Satellite desaturation"
                hint="Applies on the home telemetry map; 0% keeps the original colors"
                right={
                  <Stepper
                    value={satelliteDesaturationPercent}
                    unit="%"
                    min={0}
                    max={100}
                    step={5}
                    onChange={(nextPercent) => {
                      const percent = Math.min(100, Math.max(0, nextPercent))
                      void set('satelliteImagerySaturation', -percent / 100)
                    }}
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

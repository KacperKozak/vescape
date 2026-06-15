import { View, Text, Switch, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  GaugeIcon,
  ArrowsOutLineHorizontalIcon,
  ProhibitIcon,
  FadersIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useSettingsStore } from '@/store/settingsStore'
import { theme } from '@/constants/theme'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { Stepper } from '@/components/ui/forms/Stepper'
import { IconHero } from '@/components/ui/settings/IconHero'

export default function FiltersSettingsScreen() {
  const { movingSpeedThresholdKmh, freeSpinMaxSpeedDeltaKmh, freeSpinStationaryBoardCapKmh, set } =
    useSettingsStore(
      useShallow((s) => ({
        movingSpeedThresholdKmh: s.movingSpeedThresholdKmh,
        freeSpinMaxSpeedDeltaKmh: s.freeSpinMaxSpeedDeltaKmh,
        freeSpinStationaryBoardCapKmh: s.freeSpinStationaryBoardCapKmh,
        set: s.set,
      })),
    )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={FadersIcon}
          description="Changes apply to new rides only. Rebuild history to reprocess past rides."
        />
        <SettingsCard>
          <SettingsRow
            icon={GaugeIcon}
            label="Moving speed threshold"
            hint={'Speeds below this are ignored for avg speed.\nDefault: 3 km/h.'}
            right={
              <Stepper
                value={movingSpeedThresholdKmh}
                unit="km/h"
                min={0}
                max={20}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(20, Math.max(0, nextValue))
                  if (clampedValue !== movingSpeedThresholdKmh) {
                    void set('movingSpeedThresholdKmh', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={ArrowsOutLineHorizontalIcon}
            label="Free spin speed delta"
            hint={
              'Max board-vs-GPS speed gap before sample is excluded as free spin. Lower will increase the number of excluded samples.\nDefault: 12 km/h.'
            }
            right={
              <Stepper
                value={freeSpinMaxSpeedDeltaKmh}
                unit="km/h"
                min={1}
                max={60}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(60, Math.max(1, nextValue))
                  if (clampedValue !== freeSpinMaxSpeedDeltaKmh) {
                    void set('freeSpinMaxSpeedDeltaKmh', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={ProhibitIcon}
            label="Free spin stationary cap"
            hint={
              'Max board speed allowed when GPS is nearly stationary. Lower will increase the number of excluded samples.\nDefault: 15 km/h.'
            }
            right={
              <Stepper
                value={freeSpinStationaryBoardCapKmh}
                unit="km/h"
                min={1}
                max={60}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(60, Math.max(1, nextValue))
                  if (clampedValue !== freeSpinStationaryBoardCapKmh) {
                    void set('freeSpinStationaryBoardCapKmh', clampedValue)
                  }
                }}
              />
            }
          />
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  sectionHint: {
    color: theme.neutral.textDim,
    fontSize: 12,
    marginTop: -4,
    marginBottom: 4,
    marginLeft: 4,
  },
})

import { SpeedometerIcon } from 'phosphor-react-native'

import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { Stepper } from '@/components/forms/Stepper'
import { theme } from '@/constants/theme'
import { useAlertPresetStore } from '@/modules/alerts/store/alertPresetStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

export const RIDER_TOP_SPEED_MIN = 5
export const RIDER_TOP_SPEED_MAX = 150

/**
 * Rider Top Speed stepper card. Scales the speed gauge full-scale and, via
 * `regenerateSpeed`, retunes the speed alert preset thresholds. Shared by the
 * Alerts settings entry and the add-board wizard's Alert Preset setup.
 */
export function RiderTopSpeedCard() {
  const riderTopSpeedKmh = useSettingsStore((s) => s.riderTopSpeedKmh)
  const setSetting = useSettingsStore((s) => s.set)

  const setRiderTopSpeed = (next: number) => {
    const clamped = Math.min(RIDER_TOP_SPEED_MAX, Math.max(RIDER_TOP_SPEED_MIN, next))
    if (clamped === riderTopSpeedKmh) return
    void setSetting('riderTopSpeedKmh', clamped).then(() =>
      useAlertPresetStore.getState().regenerateSpeed(),
    )
  }

  return (
    <SettingsCard>
      <SettingsRow
        icon={SpeedometerIcon}
        iconColor={theme.palette.orange.color}
        label="Rider top speed"
        hint="Fastest you consider yourself capable of riding. Scales speed gauges and alerts"
        right={
          <Stepper
            value={riderTopSpeedKmh}
            unit="km/h"
            min={RIDER_TOP_SPEED_MIN}
            max={RIDER_TOP_SPEED_MAX}
            step={5}
            onChange={setRiderTopSpeed}
          />
        }
      />
    </SettingsCard>
  )
}

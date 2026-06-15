import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BatteryChargingIcon, BluetoothIcon, LightningIcon, TrashIcon } from 'phosphor-react-native'

import { BoardSettingRow } from '@/components/domain/board/BoardSettingRow'
import { Button } from '@/components/ui/base/Button'
import { IconHero } from '@/components/ui/settings/IconHero'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { interaction, theme } from '@/constants/theme'
import type { BatterySummary } from '@/lib/boardSetup'

interface EditBoardSettingsProps {
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  pairingSaving?: boolean
  keepMissingBatteryConfig: boolean
  batterySummary: BatterySummary
  onOpenBattery: () => void
  onOpenPairing: () => void
  onClearPairing: () => Promise<void> | void
  onRemove: () => void
}

export function EditBoardSettings({
  name,
  description,
  pairedBleId,
  pairedBleName,
  pairingSaving = false,
  keepMissingBatteryConfig,
  batterySummary,
  onOpenBattery,
  onOpenPairing,
  onClearPairing,
  onRemove,
}: EditBoardSettingsProps) {
  return (
    <>
      <IconHero
        icon={LightningIcon}
        title={name.trim() || 'Unnamed board'}
        description={description.trim() || 'No description'}
        iconSize={48}
        iconColor={theme.wheel.color}
        iconWeight="duotone"
      />

      <SettingsCard>
        <BoardSettingRow
          icon={BatteryChargingIcon}
          iconColor={theme.highlight.text}
          label={keepMissingBatteryConfig ? 'Not configured' : batterySummary.title}
          value={batterySummary.value}
          hint={batterySummary.hint}
          onPress={onOpenBattery}
          testID="edit-board-battery-row"
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsRow
          icon={BluetoothIcon}
          iconColor={theme.teal.color}
          label="BLE pairing"
          hint={pairedBleId ? pairedBleName || pairedBleId : 'No device paired'}
          right={
            <View style={styles.buttonGroup}>
              <Button
                label={pairedBleId ? 'Change' : 'Pair'}
                variant="secondary"
                size="sm"
                loading={pairingSaving}
                onPress={onOpenPairing}
                testID="edit-board-pair-button"
              />
              {pairedBleId ? (
                <Button
                  label="Clear"
                  variant="destructive"
                  size="sm"
                  loading={pairingSaving}
                  onPress={onClearPairing}
                  testID="edit-board-clear-pairing-button"
                />
              ) : null}
            </View>
          }
        />
      </SettingsCard>

      <Pressable
        style={({ pressed }) => [styles.removeSection, pressed && styles.removeSectionPressed]}
        android_ripple={interaction.ripple}
        onPress={onRemove}
      >
        <TrashIcon size={14} color={theme.error.text} weight="bold" />
        <Text style={styles.removeLabel}>Remove board</Text>
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeSection: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  removeSectionPressed: {
    backgroundColor: interaction.pressedBg,
  },
  removeLabel: {
    color: theme.error.text,
    fontSize: 12,
    fontWeight: '600',
  },
})

import { StyleSheet, Text, View } from 'react-native'
import { BatteryChargingIcon, BluetoothIcon, IdentificationCardIcon } from 'phosphor-react-native'

import { BoardSettingRow } from '@/components/domain/board/BoardSettingRow'
import { Button } from '@/components/ui/base/Button'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { theme } from '@/constants/theme'
import type { BatterySummary } from '@/lib/boardSetup'

interface EditBoardSettingsProps {
  name: string
  description: string
  pairedBleId: string
  pairedBleName: string
  pairingSaving?: boolean
  keepMissingBatteryConfig: boolean
  batterySummary: BatterySummary
  onOpenInfo: () => void
  onOpenBattery: () => void
  onOpenPairing: () => void
  onClearPairing: () => Promise<void> | void
}

export function EditBoardSettings({
  name,
  description,
  pairedBleId,
  pairedBleName,
  pairingSaving = false,
  keepMissingBatteryConfig,
  batterySummary,
  onOpenInfo,
  onOpenBattery,
  onOpenPairing,
  onClearPairing,
}: EditBoardSettingsProps) {
  return (
    <>
      <SettingsSectionTitle>Board</SettingsSectionTitle>
      <SettingsCard>
        <BoardSettingRow
          icon={IdentificationCardIcon}
          iconColor={theme.wheel.text}
          label={name.trim() || 'Unnamed board'}
          value={description.trim() || 'No description'}
          hint="Name and notes"
          onPress={onOpenInfo}
          testID="edit-board-info-row"
        />
      </SettingsCard>

      <SettingsSectionTitle>Battery</SettingsSectionTitle>
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

      <View style={styles.pairing}>
        <View style={styles.pairingCopy}>
          <View style={styles.pairingTitleRow}>
            <BluetoothIcon size={14} color={theme.teal.text} weight="duotone" />
            <Text style={styles.pairingTitle}>BLE pairing</Text>
          </View>
          <Text style={styles.pairingValue} numberOfLines={1}>
            {pairedBleId ? pairedBleName || pairedBleId : 'No device paired'}
          </Text>
        </View>
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
            variant="secondary"
            size="sm"
            loading={pairingSaving}
            onPress={onClearPairing}
            testID="edit-board-clear-pairing-button"
          />
        ) : null}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  pairing: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pairingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pairingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pairingTitle: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pairingValue: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
})

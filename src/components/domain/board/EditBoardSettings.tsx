import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BatteryChargingIcon, LightningIcon, LinkIcon, TrashIcon } from 'phosphor-react-native'
import type { BoardLink } from 'vesc-ble'

import { BoardSettingRow } from '@/components/domain/board/BoardSettingRow'
import { Button } from '@/components/ui/base/Button'
import { IconHero } from '@/components/ui/settings/IconHero'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { interaction, theme } from '@/constants/theme'
import { formatBmsSuffix, formatBoardTransport } from '@/lib/boardTransport'
import type { BatterySummary } from '@/lib/boardSetup'

interface EditBoardSettingsProps {
  name: string
  description: string
  link: BoardLink | null
  linkSaving?: boolean
  keepMissingBatteryConfig: boolean
  batterySummary: BatterySummary
  onOpenBattery: () => void
  onLink: () => void
  onReprobe: () => void
  onUnlink: () => Promise<void> | void
  onRemove: () => void
}

export function EditBoardSettings({
  name,
  description,
  link,
  linkSaving = false,
  keepMissingBatteryConfig,
  batterySummary,
  onOpenBattery,
  onLink,
  onReprobe,
  onUnlink,
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
          icon={LinkIcon}
          iconColor={theme.teal.color}
          label="Board Link"
          hint={
            link
              ? `${link.bleId} · ${formatBoardTransport(link.transport)}${formatBmsSuffix(link.hasBms)}`
              : 'Not linked — probe a device to ride'
          }
          right={
            <View style={styles.buttonGroup}>
              {link ? (
                <>
                  <Button
                    label="Re-probe"
                    variant="secondary"
                    size="sm"
                    loading={linkSaving}
                    onPress={onReprobe}
                    testID="edit-board-reprobe-button"
                  />
                  <Button
                    label="Unlink"
                    variant="destructive"
                    size="sm"
                    loading={linkSaving}
                    onPress={onUnlink}
                    testID="edit-board-unlink-button"
                  />
                </>
              ) : (
                <Button
                  label="Link"
                  variant="secondary"
                  size="sm"
                  loading={linkSaving}
                  onPress={onLink}
                  testID="edit-board-link-button"
                />
              )}
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

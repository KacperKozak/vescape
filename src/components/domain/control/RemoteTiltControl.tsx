import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { CaretDownIcon, CaretUpIcon, JoystickIcon } from 'phosphor-react-native'

import { RemoteTiltPad } from '@/components/domain/control/RemoteTiltPad'
import { theme } from '@/constants/theme'
import { useRemoteTiltControl } from '@/hooks/useRemoteTiltControl'

interface RemoteTiltControlProps {
  collapsible?: boolean
  defaultExpanded?: boolean
}

/** Remote tilt controller wrapper shared by IMU and center Tune drawer. */
export function RemoteTiltControl({
  collapsible = false,
  defaultExpanded = true,
}: RemoteTiltControlProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { boardConnected, setRemoteTilt, releaseRemoteTilt, lockRemoteTilt, stopRemoteTilt } =
    useRemoteTiltControl()
  const visible = !collapsible || expanded

  return (
    <View style={styles.remoteTiltControl}>
      <Pressable
        disabled={!collapsible}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [
          styles.sectionHeader,
          collapsible && styles.sectionHeaderPressable,
          pressed && styles.sectionHeaderPressed,
        ]}
        accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityLabel="Remote tilt"
      >
        <View style={styles.sectionTitleRow}>
          <JoystickIcon size={22} color={theme.palette.sky.color} weight="duotone" />
          <View style={styles.sectionText}>
            <Text style={styles.sectionTitle} numberOfLines={1}>
              Tilt
            </Text>
            <Text style={styles.sectionDescription} numberOfLines={2}>
              Adjust board tilt from your phone in real time.
            </Text>
          </View>
        </View>
        {collapsible ? (
          expanded ? (
            <CaretUpIcon size={16} color={theme.palette.slate.textMuted} weight="bold" />
          ) : (
            <CaretDownIcon size={16} color={theme.palette.slate.textMuted} weight="bold" />
          )
        ) : null}
      </Pressable>
      {visible ? (
        <>
          <RemoteTiltPad
            disabled={!boardConnected}
            onChange={setRemoteTilt}
            onRelease={releaseRemoteTilt}
            onLock={lockRemoteTilt}
            onCancel={stopRemoteTilt}
          />
          {!boardConnected ? (
            <Text style={styles.remoteTiltDisabled}>Connect board to control tilt.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  remoteTiltControl: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionHeaderPressable: {
    minHeight: 46,
  },
  sectionHeaderPressed: {
    opacity: 0.7,
  },
  sectionTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  sectionTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionDescription: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  remoteTiltDisabled: {
    color: theme.palette.slate.textDim,
    fontSize: 12,
  },
})

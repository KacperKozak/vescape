import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  BluetoothSlashIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  CheckIcon,
} from 'phosphor-react-native'

import type { SyncBarState } from '@/tune/syncBarState'
import { theme } from '@/constants/theme'

interface TuneSyncBarProps {
  state: SyncBarState | null
  onSave: () => void
  onSaveAndSync: () => void
  onSync: () => void
  onDiscard: () => void
  bottomOffset?: number
}

export function TuneSyncBar({
  state,
  onSave,
  onSaveAndSync,
  onSync,
  onDiscard,
  bottomOffset = 16,
}: TuneSyncBarProps) {
  if (!state) return null

  const config = getConfig(state)

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View style={[styles.pill, { borderColor: config.borderColor }]}>
        <View style={styles.left}>
          {config.icon}
          <Text style={[styles.text, { color: config.textColor }]} numberOfLines={1}>
            {config.text}
          </Text>
        </View>

        {config.actions.length > 0 ? (
          <View style={styles.actions}>
            {config.actions.map((action) => (
              <Pressable
                key={action.label}
                style={[
                  styles.actionBtn,
                  action.primary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
                  action.primary ? { backgroundColor: config.accentColor } : undefined,
                ]}
                onPress={action.onPress}
              >
                {action.icon}
                <Text
                  style={[
                    styles.actionText,
                    action.primary ? { color: config.accentTextColor } : undefined,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )

  function getConfig(s: SyncBarState) {
    switch (s.variant) {
      case 'up_to_date':
        return {
          borderColor: '#334155',
          textColor: '#64748b',
          accentColor: theme.gps.color,
          accentTextColor: '#022c22',
          text: 'Your board is up to date',
          icon: <CheckCircleIcon size={16} color={theme.gps.color} weight="fill" />,
          actions: [],
        }
      case 'connect_to_sync':
        return {
          borderColor: theme.warning.border,
          textColor: theme.warning.text,
          accentColor: theme.warning.color,
          accentTextColor: '#1c0701',
          text: 'Connect to board to sync',
          icon: <BluetoothSlashIcon size={16} color={theme.warning.color} weight="bold" />,
          actions: [],
        }
      case 'save_later':
        return {
          borderColor: theme.wheel.border,
          textColor: '#e0f2fe',
          accentColor: theme.wheel.color,
          accentTextColor: '#020617',
          text: `${s.dirtyCount} unsaved field${s.dirtyCount === 1 ? '' : 's'}`,
          icon: <CloudArrowUpIcon size={16} color={theme.wheel.color} weight="bold" />,
          actions: [
            {
              label: 'Discard',
              primary: false,
              icon: <ArrowCounterClockwiseIcon size={12} color="#cbd5e1" weight="bold" />,
              onPress: onDiscard,
            },
            {
              label: 'Save',
              primary: true,
              icon: <CheckIcon size={12} color="#020617" weight="bold" />,
              onPress: onSave,
            },
          ],
        }
      case 'save_and_sync':
        return {
          borderColor: theme.wheel.border,
          textColor: '#e0f2fe',
          accentColor: theme.wheel.color,
          accentTextColor: '#020617',
          text: `${s.dirtyCount} unsaved field${s.dirtyCount === 1 ? '' : 's'}`,
          icon: <ArrowsClockwiseIcon size={16} color={theme.wheel.color} weight="bold" />,
          actions: [
            {
              label: 'Discard',
              primary: false,
              icon: <ArrowCounterClockwiseIcon size={12} color="#cbd5e1" weight="bold" />,
              onPress: onDiscard,
            },
            {
              label: 'Save & sync',
              primary: true,
              icon: <CheckIcon size={12} color="#020617" weight="bold" />,
              onPress: onSaveAndSync,
            },
          ],
        }
      case 'sync_with_board':
        return {
          borderColor: theme.gps.border,
          textColor: '#86efac',
          accentColor: '#4ade80',
          accentTextColor: '#022c22',
          text: `${s.diffCount} field${s.diffCount === 1 ? '' : 's'} differ from board`,
          icon: <ArrowsClockwiseIcon size={16} color={theme.gps.color} weight="bold" />,
          actions: [
            {
              label: 'Sync',
              primary: true,
              icon: <CheckIcon size={12} color="#022c22" weight="bold" />,
              onPress: onSync,
            },
          ],
        }
      case 'saving':
        return {
          borderColor: theme.wheel.border,
          textColor: '#bae6fd',
          accentColor: theme.wheel.color,
          accentTextColor: '#020617',
          text: 'Saving...',
          icon: <ActivityIndicator size="small" color={theme.wheel.color} />,
          actions: [],
        }
      case 'syncing':
        return {
          borderColor: theme.gps.border,
          textColor: '#bbf7d0',
          accentColor: theme.gps.color,
          accentTextColor: '#022c22',
          text: 'Syncing to board...',
          icon: <ActivityIndicator size="small" color={theme.gps.color} />,
          actions: [],
        }
    }
  }
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    alignItems: 'stretch',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    backgroundColor: '#0f172a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    gap: 5,
  },
  actionBtnPrimary: {
    // backgroundColor set inline with accentColor
  },
  actionBtnSecondary: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#172033',
  },
  actionText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
  },
})

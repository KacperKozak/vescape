import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import {
  BattCurrentCard,
  BatteryIndicator,
  ControllerTempCard,
  DutyCard,
  FootpadCard,
  ImuCard,
  MotorCurrentCard,
  MotorTempCard,
  SpeedIndicator,
  StateCard,
  TargetSection,
} from '@/components/cards'
import { routes } from '@/navigation/routes'
import { useBleStore } from '@/store/bleStore'

export function TelemetryView() {
  const hasLiveBoardData = useBleStore(
    (s) => s.status === 'connected' && s.liveStatus.boardSampleCount > 0,
  )

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      <TargetSection />

      <View style={!hasLiveBoardData && styles.dimmed}>
        <Pressable
          style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressablePressed]}
          onPress={() => router.push(routes.controlBattery)}
          android_ripple={{
            color: 'rgba(148, 163, 184, 0.18)',
            borderless: false,
            foreground: true,
          }}
        >
          <BatteryIndicator />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressablePressed]}
          onPress={() => router.push(routes.controlSpeed)}
          android_ripple={{
            color: 'rgba(148, 163, 184, 0.18)',
            borderless: false,
            foreground: true,
          }}
        >
          <SpeedIndicator />
        </Pressable>

        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlDuty)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <DutyCard />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlMotorTemp)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <MotorTempCard />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlMotorCurrent)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <MotorCurrentCard />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlControllerTemp)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <ControllerTempCard />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlBattCurrent)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <BattCurrentCard />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlFootpad)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <FootpadCard />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlImu)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <ImuCard />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.rowItem, pressed && styles.cardPressablePressed]}
            onPress={() => router.push(routes.controlState)}
            android_ripple={{
              color: 'rgba(148, 163, 184, 0.18)',
              borderless: false,
              foreground: true,
            }}
          >
            <StateCard />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  grid: { padding: 12, paddingBottom: 96 },
  dimmed: { opacity: 0.35 },
  row: { flexDirection: 'row', marginBottom: 4 },
  cardPressable: { borderRadius: 10, overflow: 'hidden' },
  cardPressablePressed: { opacity: 0.84 },
  rowItem: { flex: 1, borderRadius: 10, overflow: 'hidden' },
})

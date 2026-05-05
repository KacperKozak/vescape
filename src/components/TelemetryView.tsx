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
  const hasData = useBleStore((s) => s.recentTelemetry.length > 0)

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      <TargetSection />

      <View style={!hasData && styles.dimmed}>
        <Pressable onPress={() => router.push(routes.controlBattery)}>
          <BatteryIndicator />
        </Pressable>
        <Pressable onPress={() => router.push(routes.controlSpeed)}>
          <SpeedIndicator />
        </Pressable>

        <View style={styles.row}>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlDuty)}>
            <DutyCard />
          </Pressable>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlMotorTemp)}>
            <MotorTempCard />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlMotorCurrent)}>
            <MotorCurrentCard />
          </Pressable>
          <Pressable
            style={styles.rowItem}
            onPress={() => router.push(routes.controlControllerTemp)}
          >
            <ControllerTempCard />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlBattCurrent)}>
            <BattCurrentCard />
          </Pressable>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlFootpad)}>
            <FootpadCard />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlImu)}>
            <ImuCard />
          </Pressable>
          <Pressable style={styles.rowItem} onPress={() => router.push(routes.controlState)}>
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
  rowItem: { flex: 1 },
})

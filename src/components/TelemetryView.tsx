import { ScrollView, StyleSheet, View } from 'react-native'

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
import { useBleStore } from '@/store/bleStore'

export function TelemetryView() {
  const hasData = useBleStore((s) => s.recentTelemetry.length > 0)

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      <TargetSection />

      <View style={!hasData && styles.dimmed}>
        <BatteryIndicator />
        <SpeedIndicator />

        <View style={styles.row}>
          <DutyCard />
          <MotorTempCard />
        </View>
        <View style={styles.row}>
          <MotorCurrentCard />
          <ControllerTempCard />
        </View>
        <View style={styles.row}>
          <BattCurrentCard />
          <StateCard />
        </View>
        <View style={styles.row}>
          <FootpadCard />
          <ImuCard />
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  grid: { padding: 12, paddingBottom: 96 },
  dimmed: { opacity: 0.35 },
  row: { flexDirection: 'row', marginBottom: 4 },
})

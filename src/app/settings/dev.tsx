import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  CaretRightIcon,
  ChartLineUpIcon,
  SpeakerHighIcon,
  SwatchesIcon,
  ToolboxIcon,
} from 'phosphor-react-native'

import { routes } from '@/navigation/routes'

const devPages = [
  {
    label: 'Components library',
    hint: 'Browse all UI components with live props',
    route: routes.settingsComponents,
    icon: SwatchesIcon,
  },
  {
    label: 'Sound Playground',
    hint: 'Preview alert presets and geiger simulation',
    route: routes.settingsSoundPlayground,
    icon: SpeakerHighIcon,
  },
  {
    label: 'Diagnostic',
    hint: 'PostHog status and manual diagnostic events',
    route: routes.settingsDiagnostic,
    icon: ChartLineUpIcon,
  },
  {
    label: 'Other',
    hint: 'Small platform probes and local experiments',
    route: routes.settingsOther,
    icon: ToolboxIcon,
  },
]

export default function DevSettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Dev tools</Text>

        <View style={styles.card}>
          {devPages.map((page, index) => {
            const Icon = page.icon

            return (
              <View key={page.label}>
                <Pressable style={styles.row} onPress={() => router.push(page.route)}>
                  <View style={styles.rowIcon}>
                    <Icon size={20} color="#94a3b8" weight="duotone" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowLabel}>{page.label}</Text>
                    <Text style={styles.rowHint}>{page.hint}</Text>
                  </View>
                  <CaretRightIcon size={18} color="#64748b" weight="bold" />
                </Pressable>
                {index < devPages.length - 1 ? <View style={styles.separator} /> : null}
              </View>
            )
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    color: '#64748b',
    fontSize: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#334155',
    marginLeft: 58,
  },
})

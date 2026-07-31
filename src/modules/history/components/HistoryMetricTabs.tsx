import { Pressable, StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import {
  OPTIONAL_CHART_METRICS,
  type OptionalChartMetric,
} from '@/modules/history/components/historyChartMetrics'

const OPTIONAL_CHART_TAB_COUNT = OPTIONAL_CHART_METRICS.length

interface HistoryMetricTabsProps {
  activeCharts: ReadonlySet<OptionalChartMetric>
  onToggle: (metric: OptionalChartMetric) => void
}

export function HistoryMetricTabs({ activeCharts, onToggle }: HistoryMetricTabsProps) {
  return (
    <View style={styles.metricTabs}>
      {OPTIONAL_CHART_METRICS.map((metric, index) => {
        const active = activeCharts.has(metric.key)
        return (
          <Pressable
            key={metric.key}
            testID={`history-metric-tab-${metric.key}`}
            style={[
              styles.metricTab,
              index < OPTIONAL_CHART_METRICS.length - 1 && styles.metricTabDivider,
              active && styles.metricTabActive,
            ]}
            onPress={() => onToggle(metric.key)}
          >
            <View
              style={[
                styles.metricTabLine,
                { backgroundColor: active ? metric.color : theme.neutral.surface },
              ]}
            />
            {metric.multilineLabel ? (
              <View style={styles.metricTabTextStack}>
                <Text
                  style={[styles.metricTabText, active && styles.metricTabTextActive]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {metric.multilineLabel[0]}
                </Text>
                <Text
                  style={[styles.metricTabText, active && styles.metricTabTextActive]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {metric.multilineLabel[1]}
                </Text>
              </View>
            ) : (
              <Text
                style={[styles.metricTabText, active && styles.metricTabTextActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {metric.label}
              </Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  metricTabs: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surfaceDeep,
    overflow: 'hidden',
  },
  metricTab: {
    width: `${100 / OPTIONAL_CHART_TAB_COUNT}%`,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surfaceDeep,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
  },
  metricTabDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.neutral.border,
  },
  metricTabActive: {
    backgroundColor: theme.palette.sky.bg,
  },
  metricTabLine: {
    width: '60%',
    height: 3,
    borderRadius: 2,
    marginBottom: 6,
  },
  metricTabTextStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  metricTabText: {
    color: theme.neutral.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
    lineHeight: 12,
  },
  metricTabTextActive: {
    color: theme.palette.sky.text,
  },
})

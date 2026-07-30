import {
  BatteryMediumIcon,
  LightningIcon,
  SpeedometerIcon,
  ThermometerHotIcon,
  ThermometerSimpleIcon,
  type Icon,
} from 'phosphor-react-native'

import { ALERT_PRESET_METRIC_LABELS } from '@/modules/alerts/constants/metricLabels'
import type { AlertPresetMetric } from '@/modules/alerts/lib/alertPresets'

export const ALERT_METRIC_META: Record<AlertPresetMetric, { name: string; icon: Icon }> = {
  battery: { name: ALERT_PRESET_METRIC_LABELS.battery, icon: BatteryMediumIcon },
  'motor-temp': {
    name: ALERT_PRESET_METRIC_LABELS['motor-temp'],
    icon: ThermometerSimpleIcon,
  },
  'controller-temp': {
    name: ALERT_PRESET_METRIC_LABELS['controller-temp'],
    icon: ThermometerHotIcon,
  },
  speed: { name: ALERT_PRESET_METRIC_LABELS.speed, icon: SpeedometerIcon },
  duty: { name: ALERT_PRESET_METRIC_LABELS.duty, icon: LightningIcon },
}

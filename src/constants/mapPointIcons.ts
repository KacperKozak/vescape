import {
  ChargingStationIcon,
  CompassIcon,
  EyeIcon,
  FlagIcon,
  type Icon,
} from 'phosphor-react-native'
import type { MapPointKind } from 'vesc-ble'

import {
  BonkMapPointIcon,
  DropMapPointIcon,
  SlideMapPointIcon,
} from '@/components/domain/map/MapPointSvgIcons'

const MAP_POINT_KIND_ICONS: Record<MapPointKind, Icon> = {
  direction: CompassIcon,
  drop: DropMapPointIcon,
  bonk: BonkMapPointIcon,
  nose_slide: SlideMapPointIcon,
  trail_entry: FlagIcon,
  viewpoint: EyeIcon,
  charging: ChargingStationIcon,
  charging_food: ChargingStationIcon,
}

export function getMapPointKindIcon(kind: MapPointKind) {
  return MAP_POINT_KIND_ICONS[kind]
}

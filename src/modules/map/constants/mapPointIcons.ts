import {
  ChargingStationIcon,
  CompassIcon,
  EyeIcon,
  FlagIcon,
  type Icon,
} from 'phosphor-react-native'
import type { MapPinKind } from '@/modules/map/constants/mapPoints'

import {
  BonkMapPointIcon,
  DropMapPointIcon,
  SlideMapPointIcon,
} from '@/modules/map/components/MapPointSvgIcons'

const MAP_POINT_KIND_ICONS: Record<MapPinKind, Icon> = {
  direction: CompassIcon,
  drop: DropMapPointIcon,
  bonk: BonkMapPointIcon,
  nose_slide: SlideMapPointIcon,
  trail_entry: FlagIcon,
  viewpoint: EyeIcon,
  charging: ChargingStationIcon,
  charging_food: ChargingStationIcon,
}

export function getMapPointKindIcon(kind: MapPinKind) {
  return MAP_POINT_KIND_ICONS[kind]
}

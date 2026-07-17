import {
  ProhibitIcon,
  QuestionIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'

import type { LegalRoadStatus } from '@/lib/legal/types'

export const LEGAL_LIMIT_STATUS_ICONS: Record<LegalRoadStatus, Icon> = {
  likelyLegal: ShieldCheckIcon,
  restricted: WarningCircleIcon,
  notRoadLegal: ProhibitIcon,
  unknown: QuestionIcon,
}

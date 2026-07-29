import type { MapTargetSheetAction } from '@/modules/map-points/components/mapTargetSheetChrome'
import {
  MapPointDetails,
  MapTargetActionRow,
  MapTargetPrimaryAction,
  MapTargetReadHeader,
  MapTargetSheetFrame,
} from '@/modules/map-points/components/mapTargetSheetChrome'
import type { MapPointMediaAsset } from '@/modules/map-points/store/mapPointPhotoFiles'
import type { MapSelection } from '@/modules/map/lib/mapSelection'

export function MapTargetNavigationBody({
  target,
  bottom,
  action,
  media,
  onDismiss,
  onFocusTarget,
}: {
  target: MapSelection
  bottom: number
  action: MapTargetSheetAction
  media: readonly MapPointMediaAsset[]
  onDismiss?: () => void
  onFocusTarget?: () => void
}) {
  return (
    <MapTargetSheetFrame
      target={target}
      bottom={bottom}
      header={<MapTargetReadHeader target={target} />}
      fallbackColor={action.color}
      fallbackTextColor={action.textColor}
      onDismiss={onDismiss}
      onFocusTarget={onFocusTarget}
    >
      {target.type === 'mapPoint' ? <MapPointDetails point={target.point} media={media} /> : null}
      <MapTargetActionRow>
        <MapTargetPrimaryAction action={action} />
      </MapTargetActionRow>
    </MapTargetSheetFrame>
  )
}

import * as ImagePicker from 'expo-image-picker'
import {
  MapPinIcon,
  PencilSimpleIcon,
  PlusIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
  XIcon,
  type Icon,
} from 'phosphor-react-native'
import { createElement, useCallback, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import type { MapPoint, MapPointPatch } from 'vescape-core'

import { IconButton } from '@/components/base/IconButton'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { useKeyboardLift } from '@/hooks/useKeyboardLift'
import { MapPointMediaActions } from '@/modules/map-points/components/MapPointMediaAddButton'
import { MapPointMediaPreview } from '@/modules/map-points/components/MapPointMediaPreview'
import { mapSheetStyles } from '@/modules/map-points/components/mapSheetStyles'
import { getMapPointKindIcon } from '@/modules/map-points/constants/mapPointIcons'
import {
  getMapPointKindColor,
  getMapPointKindLabel,
  getMapPointKindTextColor,
  MAP_POINT_MEDIA_ENABLED,
} from '@/modules/map-points/constants/mapPoints'
import type { MapSelection } from '@/modules/map/lib/mapSelection'
import {
  deleteMapPointMediaAsset,
  saveMapPointMediaAssets,
  type MapPointMediaAsset,
  type PickedMapPointMediaAsset,
} from '@/modules/map-points/store/mapPointPhotoFiles'

/**
 * The sheet for whatever the map has selected: a searched place, a dropped pin, or a Map Point.
 * For a Map Point it also carries the edit draft, the vote controls and delete.
 *
 * Name and description drafts are local, so the caller keys this component by target — selecting
 * another feature must not inherit an unsaved draft.
 */
export function MapTargetSheet({
  target,
  bottom,
  mode,
  action,
  onAddFeature,
  onEdit,
  onSave,
  onSaveMapPoint,
  onVoteMapPoint,
  onDelete,
  onDismiss,
  onFocusTarget,
}: {
  target: MapSelection
  bottom: number
  mode: 'select' | 'navigation' | 'edit'
  action: {
    label: string
    accessibilityLabel: string
    color: string
    textColor: string
    borderColor: string
    bgColor: string
    Icon: Icon
    onPress: () => void
  }
  onAddFeature?: () => void
  onEdit?: () => void
  onSave?: () => void
  onSaveMapPoint?: (id: string, patch: MapPointPatch) => Promise<MapPoint | null>
  onVoteMapPoint?: (id: string, reaction: 'up' | 'down' | null) => boolean
  onDelete?: () => void
  onDismiss?: () => void
  onFocusTarget?: () => void
}) {
  const isMapPoint = target.type === 'mapPoint'
  const point = isMapPoint ? target.point : null
  const selectedPoint = point as MapPoint | null
  // The vote lives in the store (optimistically), so the sheet only renders it.
  const reaction = point?.myReaction ?? null
  const [name, setName] = useState(point?.name ?? '')
  const [description, setDescription] = useState(point?.description ?? '')
  // Parked with `MAP_POINT_MEDIA_ENABLED`: media stays on the device because server Map Points
  // carry none, so it is never part of the saved patch.
  const [media, setMedia] = useState<MapPointMediaAsset[]>([])
  const [mediaSaving, setMediaSaving] = useState(false)
  const keyboardLift = useKeyboardLift(mode === 'edit')
  const sheetBottom = mode === 'edit' ? Math.max(bottom, keyboardLift + 12) : bottom
  const color =
    target.type === 'mapPoint' ? getMapPointKindColor(target.point.category) : action.color
  const textColor =
    target.type === 'mapPoint' ? getMapPointKindTextColor(target.point.category) : action.textColor
  const icon = createElement(isMapPoint ? getMapPointKindIcon(target.point.category) : MapPinIcon, {
    size: 18,
    color: textColor,
    weight: 'duotone',
  })
  const headerTitle = isMapPoint
    ? point?.name?.trim() || getMapPointKindLabel(point?.category ?? 'drop')
    : target.title
  const detailText =
    isMapPoint && mode !== 'edit'
      ? point?.description?.trim() || null
      : target.loadingDetails
        ? 'Loading details'
        : target.subtitle ||
          (!isMapPoint ? `${target.latitude.toFixed(5)}, ${target.longitude.toFixed(5)}` : null)
  const pointCreatedText = point ? new Date(point.createdAt).toLocaleDateString() : null
  const handlePickMedia = useCallback(async () => {
    if (!point) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.9,
    })
    if (result.canceled || !result.assets[0]?.uri) return
    setMediaSaving(true)
    try {
      const picked: PickedMapPointMediaAsset[] = result.assets.map((asset) => ({
        id: asset.assetId ?? asset.uri,
        uri: asset.uri,
        filename: asset.fileName ?? '',
        mediaType: asset.type === 'video' ? 'video' : 'photo',
      }))
      const saved = await saveMapPointMediaAssets(point.id, picked)
      setMedia((current) => {
        const existingUris = new Set(current.map((asset) => asset.uri))
        return [...current, ...saved.filter((asset) => !existingUris.has(asset.uri))]
      })
    } finally {
      setMediaSaving(false)
    }
  }, [point])
  const handleCaptureMedia = useCallback(
    async (mediaTypes: ['images'] | ['videos']) => {
      if (!point) return
      const permission = await ImagePicker.getCameraPermissionsAsync()
      const granted = permission.granted
        ? true
        : (await ImagePicker.requestCameraPermissionsAsync()).granted
      if (!granted) return

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes,
        quality: 0.9,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      })
      if (result.canceled || !result.assets[0]?.uri) return
      setMediaSaving(true)
      try {
        const picked: PickedMapPointMediaAsset[] = result.assets.map((asset) => ({
          id: asset.assetId ?? asset.uri,
          uri: asset.uri,
          filename: asset.fileName ?? '',
          mediaType: asset.type === 'video' ? 'video' : 'photo',
        }))
        const saved = await saveMapPointMediaAssets(point.id, picked)
        setMedia((current) => {
          const existingUris = new Set(current.map((asset) => asset.uri))
          return [...current, ...saved.filter((asset) => !existingUris.has(asset.uri))]
        })
      } finally {
        setMediaSaving(false)
      }
    },
    [point],
  )
  const handleSave = useCallback(async () => {
    if (point && onSaveMapPoint) {
      await onSaveMapPoint(point.id, { name, description })
    }
    onSave?.()
  }, [description, name, onSave, onSaveMapPoint, point])
  const handleRemoveMedia = useCallback((asset: MapPointMediaAsset) => {
    setMedia((current) => current.filter((candidate) => candidate.uri !== asset.uri))
    deleteMapPointMediaAsset(asset.uri)
  }, [])
  const headerTargetContent = (
    <>
      <View style={[mapSheetStyles.mapTargetIcon, { borderColor: color }]}>{icon}</View>
      <View style={mapSheetStyles.mapTargetTitleBlock}>
        {isMapPoint && mode === 'edit' ? (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={getMapPointKindLabel(point?.category ?? 'drop')}
            placeholderTextColor={theme.palette.slate.textMuted}
            style={[styles.mapTargetInput, styles.mapTargetNameInput]}
            accessibilityLabel="Map feature name"
          />
        ) : (
          <Text style={mapSheetStyles.mapTargetTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
        )}
        {isMapPoint && mode !== 'edit' ? (
          <Text style={styles.mapTargetMetaText} numberOfLines={1}>
            Vescape rider · {pointCreatedText ?? 'Unknown date'}
          </Text>
        ) : detailText ? (
          <Text style={mapSheetStyles.mapTargetSubtitle} numberOfLines={2}>
            {detailText}
          </Text>
        ) : null}
      </View>
    </>
  )

  return (
    <View style={[styles.mapTargetSheet, { bottom: sheetBottom }]}>
      <View style={styles.mapTargetHeader}>
        {onFocusTarget ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Center map on target"
            onPress={onFocusTarget}
            style={({ pressed }) => [
              styles.mapTargetFocusArea,
              pressed && styles.mapTargetFocusAreaPressed,
            ]}
          >
            {headerTargetContent}
          </Pressable>
        ) : (
          <View style={styles.mapTargetFocusArea}>{headerTargetContent}</View>
        )}
        {onDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close target"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.mapTargetClose,
              pressed && mapSheetStyles.mapTargetClosePressed,
            ]}
          >
            <XIcon size={20} color={theme.palette.slate.textSecondary} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      {isMapPoint && mode !== 'edit' && detailText ? (
        <View style={styles.mapTargetDescriptionBlock}>
          <Text style={mapSheetStyles.mapTargetSubtitle}>{detailText}</Text>
        </View>
      ) : null}

      {isMapPoint && mode === 'edit' ? (
        <View style={styles.mapTargetDraftFields}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor={theme.palette.slate.textMuted}
            multiline
            style={[styles.mapTargetInput, styles.mapTargetDescriptionInput]}
            accessibilityLabel="Map feature description"
          />
          {MAP_POINT_MEDIA_ENABLED ? (
            <View style={styles.mapTargetMediaBox}>
              <MapPointMediaPreview assets={media} onRemove={handleRemoveMedia} />
              <MapPointMediaActions
                loading={mediaSaving}
                onAdd={handlePickMedia}
                onCapturePhoto={() => void handleCaptureMedia(['images'])}
                onCaptureVideo={() => void handleCaptureMedia(['videos'])}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {MAP_POINT_MEDIA_ENABLED && isMapPoint && mode !== 'edit' && media.length > 0 ? (
        <View style={styles.mapTargetMediaBox}>
          <MapPointMediaPreview assets={media} />
        </View>
      ) : null}
      {isMapPoint && mode !== 'edit' && point ? (
        <View style={styles.mapTargetVoteCount}>
          {point.score < 0 ? (
            <ThumbsDownIcon size={14} color={theme.status.error.text} weight="fill" />
          ) : (
            <ThumbsUpIcon size={14} color={theme.palette.cyan.text} weight="fill" />
          )}
          <Text style={styles.mapTargetMetaText}>{point.score}</Text>
        </View>
      ) : null}

      {mode === 'edit' ? (
        <View style={styles.mapTargetActionRow}>
          {onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete map feature"
              onPress={onDelete}
              style={({ pressed }) => [
                styles.mapTargetDeleteIconButton,
                styles.mapTargetDeleteButton,
                pressed && mapSheetStyles.mapTargetNavigatePressed,
              ]}
            >
              <TrashIcon size={18} color={theme.status.error.text} weight="bold" />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save map feature"
            onPress={handleSave}
            style={({ pressed }) => [
              styles.mapTargetActionButton,
              styles.mapTargetSaveButton,
              pressed && mapSheetStyles.mapTargetNavigatePressed,
            ]}
          >
            <Text style={[mapSheetStyles.mapTargetNavigateText, styles.mapTargetSaveText]}>
              Save
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.mapTargetActionRow}>
          {isMapPoint && mode === 'select' && onEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit map feature"
              onPress={onEdit}
              style={({ pressed }) => [
                styles.mapTargetEditButton,
                pressed && mapSheetStyles.mapTargetNavigatePressed,
              ]}
            >
              <PencilSimpleIcon size={18} color={theme.palette.slate.textPrimary} weight="bold" />
              <Text style={[mapSheetStyles.mapTargetNavigateText, styles.mapTargetSaveText]}>
                Edit
              </Text>
            </Pressable>
          ) : null}
          {isMapPoint && mode === 'select' && onVoteMapPoint && selectedPoint ? (
            <View style={styles.mapTargetVoteGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vote map feature up"
                onPress={() => onVoteMapPoint(selectedPoint.id, reaction === 'up' ? null : 'up')}
                style={({ pressed }) => [
                  styles.mapTargetVoteButton,
                  reaction === 'up' && styles.mapTargetUpButtonActive,
                  pressed && mapSheetStyles.mapTargetNavigatePressed,
                ]}
              >
                <ThumbsUpIcon
                  size={18}
                  color={
                    reaction === 'up' ? theme.palette.cyan.text : theme.palette.slate.textPrimary
                  }
                  weight={reaction === 'up' ? 'fill' : 'bold'}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vote map feature down"
                onPress={() =>
                  onVoteMapPoint(selectedPoint.id, reaction === 'down' ? null : 'down')
                }
                style={({ pressed }) => [
                  styles.mapTargetVoteButton,
                  reaction === 'down' && styles.mapTargetDownButtonActive,
                  pressed && mapSheetStyles.mapTargetNavigatePressed,
                ]}
              >
                <ThumbsDownIcon
                  size={18}
                  color={
                    reaction === 'down' ? theme.status.error.text : theme.palette.slate.textPrimary
                  }
                  weight={reaction === 'down' ? 'fill' : 'bold'}
                />
              </Pressable>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.mapTargetActionButton,
              {
                backgroundColor: action.bgColor,
                borderColor: action.borderColor,
              },
              pressed && mapSheetStyles.mapTargetNavigatePressed,
            ]}
          >
            <action.Icon size={18} color={action.textColor} weight="bold" />
            <Text style={[mapSheetStyles.mapTargetNavigateText, { color: action.textColor }]}>
              {action.label}
            </Text>
          </Pressable>
          {!isMapPoint && mode === 'select' && onAddFeature ? (
            <IconButton
              icon={PlusIcon}
              size="md"
              onPress={onAddFeature}
              accent={theme.palette.cyan.text}
              accessibilityLabel="Add map feature here"
            />
          ) : null}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  mapTargetActionButton: {
    flex: 1,
    minWidth: 0,
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.palette.green.bg,
    borderWidth: 1,
    borderColor: theme.palette.green.border,
  },
  mapTargetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapTargetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTargetDeleteButton: {
    backgroundColor: theme.status.error.bg,
    borderColor: theme.status.error.border,
  },
  mapTargetDeleteIconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  mapTargetDescriptionBlock: {
    paddingRight: 36,
  },
  mapTargetDescriptionInput: {
    minHeight: 72,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  mapTargetDownButtonActive: {
    borderColor: theme.status.error.border,
    backgroundColor: theme.status.error.bg,
  },
  mapTargetDraftFields: {
    gap: 8,
  },
  mapTargetEditButton: {
    minWidth: 88,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.75),
  },
  mapTargetFocusArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
  },
  mapTargetFocusAreaPressed: {
    opacity: 0.65,
  },
  mapTargetHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapTargetInput: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.75),
    paddingHorizontal: 12,
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  mapTargetMediaBox: {
    gap: 12,
  },
  mapTargetMetaText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  mapTargetNameInput: {
    minHeight: 38,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: '900',
  },
  mapTargetSaveButton: {
    backgroundColor: theme.palette.cyan.border,
    borderColor: theme.palette.cyan.border,
  },
  mapTargetSaveText: {
    color: theme.palette.slate.textPrimary,
  },
  mapTargetSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 45,
    gap: 12,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  },
  mapTargetUpButtonActive: {
    borderColor: theme.palette.cyan.border,
    backgroundColor: theme.palette.cyan.bg,
  },
  mapTargetVoteButton: {
    width: 46,
    height: 46,
    paddingHorizontal: 0,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.75),
  },
  mapTargetVoteCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mapTargetVoteGroup: {
    flexDirection: 'row',
    gap: 4,
  },
})

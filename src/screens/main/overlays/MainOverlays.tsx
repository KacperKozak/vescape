import * as Haptics from 'expo-haptics'
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  CloudSunIcon,
  ClockCounterClockwiseIcon,
  ImageSquareIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  MapPinIcon,
  NavigationArrowIcon,
  PencilSimpleIcon,
  FunnelIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SirenIcon,
  SpeedometerIcon,
  TrashIcon,
  XIcon,
  type Icon,
} from 'phosphor-react-native'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  createElement,
  type RefObject,
} from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Text } from '@/components/base/Text'
import Animated, {
  cancelAnimation,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { HistoryMarker, MapPoint, MapPointKind } from 'vescape-core'

import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { EdgeDrawer } from '@/components/overlays/AnchoredSheet'
import { MediaHistoryViewer } from '@/modules/history/components/MediaHistoryViewer'
import { FloatingBar } from '@/modules/board/components/FloatingBar'
import { HistorySessionSheet } from '@/modules/history/components/HistorySessionSheet'
import { IconButton } from '@/components/base/IconButton'
import { MapNavigationSelector } from '@/modules/map/components/MapNavigationSelector'
import { MapStyleSwitch } from '@/modules/map/components/MapStyleSwitch'
import { PillSelector, PillSelectorItem } from '@/components/controls/PillSelector'
import { WeatherIcon } from '@/modules/weather/components/WeatherIcon'
import type { MapNavigationMode, MapStyleKey } from '@/modules/map/constants/mapStyles'
import { getMapPointKindIcon } from '@/modules/map/constants/mapPointIcons'
import {
  FILTERABLE_MAP_POINT_KIND_OPTIONS,
  getMapPointKindColor,
  getMapPointKindLabel,
  getMapPointKindTextColor,
  MAP_POINT_KIND_OPTIONS,
} from '@/modules/map/constants/mapPoints'
import { theme } from '@/constants/theme'
import type { MapSelection } from '@/modules/map/lib/mapSelection'
import { type MapSearchResult } from '@/modules/map/lib/search'
import { useMapSearch } from '@/modules/map/hooks/useMapSearch'
import { isCompactMapPointKind } from '@/modules/map/lib/mapPointVisibility'
import type { HistoryMetricKey } from '@/modules/history/lib/metricColorScale'
import {
  BottomTelemetryStrip,
  STRIP_CONTENT_HEIGHT,
} from '@/screens/main/overlays/BottomTelemetryStrip'
import { type MainMapHandle } from '@/screens/main/map/MainMap'
import {
  OffscreenMapIndicator,
  type OffscreenMapIndicatorState,
} from '@/screens/main/map/offscreenMapIndicators'
import type { MapSelector } from '@/screens/main/mainScreenStore'
import type { MainViewState } from '@/screens/main/mainViewState'
import { HistoryControls } from '@/screens/main/history/HistoryControls'
import { HistoryEmptyState } from '@/modules/history/components/HistoryEmptyState'
import { WeatherHourlyStrip } from '@/modules/weather/components/WeatherHourlyStrip'
import { WeatherPill } from '@/modules/weather/components/WeatherPill'
import { WeatherRadarTimeline } from '@/modules/weather/components/WeatherRadarTimeline'
import { useMapWeather } from '@/modules/weather/hooks/useMapWeather'
import { HistoryStatsBar } from '@/screens/main/history/HistoryStatsBar'
import { HistoryTelemetryPanel } from '@/screens/main/history/HistoryTelemetryPanel'
import { LegalLimitCountrySheet } from '@/modules/legal/components/LegalLimitCountrySheet'
import { LiveHud } from '@/screens/main/overlays/LiveHud'
import { MapRevealGesture } from '@/screens/main/map/MapRevealGesture'
import { MapVignette } from '@/screens/main/map/MapVignette'
import { TopBar } from '@/screens/main/overlays/TopBar'
import { TuneDrawer } from '@/screens/main/overlays/TuneDrawer'
import type { Board } from '@/modules/board/store/boardStore'
import type {
  HistorySession,
  TelemetryMinuteBucket,
  TelemetrySample,
} from '@/modules/history/store/historyStore'
import type { MediaAssetInput, MediaHistoryAsset } from '@/modules/history/lib/mediaHistory'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'
import { useRainViewerRadarStore } from '@/modules/weather/store/rainViewerRadarStore'
import { isNightAtTime, weatherCodeToColor } from '@/modules/weather/lib/weather'
import { normalizeLegalModeSettings } from '@/modules/legal/lib/legalMode'
import {
  LEGAL_LIMIT_COUNTRIES,
  LEGAL_ROAD_STATUS_COLORS,
  LEGAL_ROAD_STATUS_LEGEND,
  LEGAL_ROAD_STATUS_LABELS,
  type LegalLimitCountry,
} from '@/modules/legal/lib/legalLimits'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { useRiderStore } from '@/modules/group-ride/store/riderStore'

const LEGAL_LIST_PANEL_HEIGHT = 280
const LEGAL_OVERLAY_GAP = 8
const LEGAL_LEGEND_HEIGHT = 12
const LEGAL_LIST_TOGGLE_HEIGHT = 42

interface MainBoardOverlayProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
}

interface MainMapOverlayProps {
  heading: SharedValue<number>
  mapStyleKey: MapStyleKey
  setMapStyleKey: (key: MapStyleKey) => void
  satelliteMapImageryOpacity: number
  setSatelliteMapImageryOpacity: (opacity: number) => void
  mapNavigationMode: MapNavigationMode
  setMapNavigationMode: (mode: MapNavigationMode) => void
  mapSelector: MapSelector
  setMapSelector: (selector: MapSelector) => void
  enterMapFocus: () => void
  exitMapFocus: () => void
  enterWeather: () => void
  exitWeather: () => void
  enterLegalLimits: () => void
  exitLegalLimits: () => void
  refreshWeather: () => void
  weatherLocation: { latitude: number; longitude: number } | null
  directionPoint: MapPoint | null
  activeNavigationTarget: MapSelection | null
  selectedNavigationTarget: MapSelection | null
  onSelectNavigationTarget: (selection: MapSelection) => void
  onNavigateTarget: (selection: MapSelection) => Promise<void>
  onNavigateSelectedTarget: () => Promise<void>
  onCancelNavigation: () => void
  onDismissSelectedTarget: () => void
  addMapPoint: (kind: MapPointKind, latitude: number, longitude: number) => Promise<MapPoint>
  onRemoveMapPoint: (id: string) => void
  hiddenMapPointKinds: MapPointKind[]
  toggleMapPointKindVisibility: (kind: MapPointKind) => void
  offscreenMapIndicators: OffscreenMapIndicatorState[]
  onOffscreenIndicatorPress: (indicator: OffscreenMapIndicatorState) => void
}

interface MainHistoryOverlayProps {
  enterHistoryMode: () => void
  selectedSession: HistorySession | null
  sessionSamples: TelemetrySample[]
  sessionMarkers: HistoryMarker[]
  previousRide: HistorySession | null
  nextRide: HistorySession | null
  canPreviousRide: boolean
  loadingSession: boolean
  historyLoading: boolean
  historyHasMore: boolean
  historyError: string | undefined
  blocks: TelemetryMinuteBucket[]
  sessions: HistorySession[]
  historySheetVisible: boolean
  setHistorySheetVisible: (visible: boolean) => void
  selectSession: (session: HistorySession | null) => Promise<void>
  loadMoreHistory: () => Promise<void>
  selectPreviousRide: () => Promise<void>
  selectNextRide: () => Promise<void>
  selectRide: (session: HistorySession) => void
  exitHistory: () => void
  removeSession: () => void
  onSeek: (timeMs: number) => void
  setActiveHistoryMapMetric: (metric: HistoryMetricKey) => void
  mediaHistory: {
    assets: MediaHistoryAsset[]
    unmatched: MediaAssetInput[]
    loading: boolean
    error: string | null
    add: () => Promise<void>
  }
  openMedia: (asset: MediaAssetInput) => void
  openMediaAssetId: string | null
  closeMedia: () => void
}

interface MainOverlaysProps {
  mode: MainViewState
  mapRef: RefObject<MainMapHandle | null>
  mapInteractionHandlerRef: RefObject<() => void>
  board: MainBoardOverlayProps
  map: MainMapOverlayProps
  history: MainHistoryOverlayProps
}

const RECORD_BUTTON_HEIGHT = 48
const HISTORY_BUTTON_SIZE = 54
const TELEMETRY_FADE_TIMING = { duration: 260 } as const
function clearPlacementTimeoutRef(ref: { current: ReturnType<typeof setTimeout> | null }) {
  if (!ref.current) return
  clearTimeout(ref.current)
  ref.current = null
}

function navigationActionColors(riderColor: string | null) {
  return {
    color: riderColor ?? theme.palette.green.color,
    textColor: riderColor ?? theme.palette.green.text,
  }
}
interface FullMapControlsProps {
  mapRef: RefObject<MainMapHandle | null>
  map: MainMapOverlayProps
  mapInteractionHandlerRef: RefObject<() => void>
  top: number
  bottom: number
  sheetBottom: number
  openAddMenuKey: number
  onBeginEditMapPoint: (id: string) => void
}

interface MapControlsProps {
  mode: MainViewState
  mapRef: RefObject<MainMapHandle | null>
  map: MainMapOverlayProps
}

interface MapModeTabsProps {
  mode: MainViewState
  top: number
  map: MainMapOverlayProps
  onResetLegalSelection: () => void
}

const centerPlacementPointerEntering = () => {
  'worklet'
  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: 1.2 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 260 }),
      transform: [{ scale: withTiming(1, { duration: 260 }) }],
    },
  }
}

const centerPlacementPulseEntering = () => {
  'worklet'
  return {
    initialValues: {
      opacity: 0.65,
      transform: [{ scale: 0.75 }],
    },
    animations: {
      opacity: withTiming(0, { duration: 320 }),
      transform: [{ scale: withTiming(2.05, { duration: 320 }) }],
    },
  }
}

function FullMapControls({
  mapRef,
  map,
  mapInteractionHandlerRef,
  top,
  bottom,
  sheetBottom,
  openAddMenuKey,
  onBeginEditMapPoint,
}: FullMapControlsProps) {
  const riderColor = useRiderStore((s) => s.riderColor)
  const [searchOpen, setSearchOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [placementPulseKey, setPlacementPulseKey] = useState(0)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const placementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handledOpenAddMenuKeyRef = useRef(openAddMenuKey)
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    handleSearchQueryChange,
    resetSearch,
  } = useMapSearch({ searchOpen, proximityLocation: map.weatherLocation })

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    resetSearch()
  }, [resetSearch])

  const closeAddMenu = useCallback(
    (restoreZoom = true) => {
      clearPlacementTimeoutRef(placementTimeoutRef)
      if (addMenuOpen && restoreZoom) mapRef.current?.zoomBy(-0.45)
      setAddMenuOpen(false)
    },
    [addMenuOpen, mapRef],
  )

  useEffect(() => {
    const dismissTransientControls = () => {
      if (!searchOpen && !filterMenuOpen) return
      closeSearch()
      setFilterMenuOpen(false)
    }
    mapInteractionHandlerRef.current = dismissTransientControls
    return () => {
      if (mapInteractionHandlerRef.current === dismissTransientControls) {
        mapInteractionHandlerRef.current = () => {}
      }
    }
  }, [closeSearch, filterMenuOpen, mapInteractionHandlerRef, searchOpen])

  useEffect(
    () => () => {
      if (placementTimeoutRef.current) clearTimeout(placementTimeoutRef.current)
    },
    [],
  )

  const handleSearchSelect = useCallback(
    (result: MapSearchResult) => {
      setSearchOpen(false)
      setSearchQuery(result.title)
      mapRef.current?.focusCoordinate([result.longitude, result.latitude])
      map.onSelectNavigationTarget({
        type: 'place',
        id: result.id,
        latitude: result.latitude,
        longitude: result.longitude,
        title: result.title,
        subtitle: result.subtitle,
        category: null,
      })
    },
    [map, mapRef, setSearchQuery],
  )

  const handleSearchSubmit = useCallback(() => {
    const first = searchResults[0]
    if (first) handleSearchSelect(first)
  }, [handleSearchSelect, searchResults])

  const showNoResults =
    !searchLoading && !searchError && searchQuery.trim().length >= 2 && searchResults.length === 0

  const toggleAddMenu = useCallback(() => {
    setFilterMenuOpen(false)
    if (addMenuOpen) {
      closeAddMenu()
      return
    }
    mapRef.current?.zoomBy(0.45)
    setAddMenuOpen(true)
  }, [addMenuOpen, closeAddMenu, mapRef])

  useEffect(() => {
    if (openAddMenuKey === 0 || handledOpenAddMenuKeyRef.current === openAddMenuKey) return
    handledOpenAddMenuKeyRef.current = openAddMenuKey
    setFilterMenuOpen(false)
    closeSearch()
    setAddMenuOpen((open) => {
      if (!open) mapRef.current?.zoomBy(0.45)
      return true
    })
  }, [closeSearch, mapRef, openAddMenuKey])

  const toggleFilterMenu = useCallback(() => {
    closeAddMenu()
    setFilterMenuOpen((open) => !open)
  }, [closeAddMenu])

  const handleSelectMapPoint = useCallback(
    async (kind: MapPointKind) => {
      const center = await mapRef.current?.getViewfinderCoordinate()
      if (!center) return
      await Haptics.selectionAsync()
      setPlacementPulseKey((key) => key + 1)
      clearPlacementTimeoutRef(placementTimeoutRef)
      placementTimeoutRef.current = setTimeout(() => {
        closeAddMenu()
        void map.addMapPoint(kind, center.latitude, center.longitude).then((point) => {
          map.onSelectNavigationTarget({
            type: 'mapPoint',
            id: point.id,
            latitude: point.latitude,
            longitude: point.longitude,
            title: getMapPointKindLabel(point.kind),
            subtitle: null,
            point,
          })
          onBeginEditMapPoint(point.id)
        })
        placementTimeoutRef.current = null
      }, 180)
    },
    [closeAddMenu, map, mapRef, onBeginEditMapPoint],
  )
  const handleSelectNavigationPoint = useCallback(async () => {
    const center = await mapRef.current?.getViewfinderCoordinate()
    if (!center) return
    await Haptics.selectionAsync()
    closeAddMenu()
    await map.onNavigateTarget({
      type: 'coordinate',
      id: `center-${center.longitude.toFixed(6)}-${center.latitude.toFixed(6)}`,
      latitude: center.latitude,
      longitude: center.longitude,
      title: 'Dropped pin',
      subtitle: null,
      loadingDetails: true,
    })
  }, [closeAddMenu, map, mapRef])
  const compactMapPointOptions = MAP_POINT_KIND_OPTIONS.filter((option) =>
    isCompactMapPointKind(option.kind),
  )
  const secondaryMapPointOptions = MAP_POINT_KIND_OPTIONS.filter(
    (option) => option.kind !== 'direction' && !isCompactMapPointKind(option.kind),
  )
  const navigationAction = navigationActionColors(riderColor)

  return (
    <>
      {addMenuOpen ? (
        <CenterPlacementPointer
          color={riderColor ?? theme.palette.green.color}
          pulseKey={placementPulseKey}
        />
      ) : null}
      {searchOpen ? <MapVignette mode="map" idPrefix="search-map-vignette" topOnly /> : null}
      <IconButton
        icon={ArrowLeftIcon}
        size="sm"
        onPress={map.exitMapFocus}
        style={[styles.mapTopBackButton, { top }]}
      />
      {searchOpen ? (
        <View style={[styles.mapSearchSheet, { top }]}>
          <View style={styles.mapSearchBar}>
            <MagnifyingGlassIcon
              size={22}
              color={theme.palette.slate.textSecondary}
              weight="bold"
            />
            <TextInput
              autoFocus
              selectTextOnFocus
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              onSubmitEditing={handleSearchSubmit}
              placeholder="Address or place"
              placeholderTextColor={theme.palette.slate.textMuted}
              returnKeyType="search"
              style={styles.mapSearchInput}
            />
            <Pressable
              accessibilityLabel="Close search"
              accessibilityRole="button"
              onPress={closeSearch}
              style={({ pressed }) => [
                styles.mapSearchClose,
                pressed && styles.mapSearchClosePressed,
              ]}
            >
              <XIcon size={22} color={theme.palette.slate.textSecondary} weight="bold" />
            </Pressable>
          </View>
          {searchLoading || searchError || showNoResults || searchResults.length > 0 ? (
            <View style={styles.mapSearchResults}>
              {searchLoading ? (
                <View style={styles.mapSearchStatusRow}>
                  <ActivityIndicator size="small" color={theme.palette.sky.color} />
                  <Text style={styles.mapSearchStatusText}>Searching Mapbox</Text>
                </View>
              ) : null}
              {searchError ? (
                <View style={styles.mapSearchStatusRow}>
                  <Text style={styles.mapSearchErrorText}>{searchError}</Text>
                </View>
              ) : null}
              {showNoResults ? (
                <View style={styles.mapSearchStatusRow}>
                  <Text style={styles.mapSearchStatusText}>No results</Text>
                </View>
              ) : null}
              {searchResults.map((result, index) => (
                <Pressable
                  key={result.id}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.mapSearchResult,
                    pressed && styles.mapSearchResultPressed,
                  ]}
                  onPress={() => handleSearchSelect(result)}
                >
                  <View style={styles.mapSearchResultIcon}>
                    <MapPinIcon size={16} color={theme.palette.green.text} weight="duotone" />
                  </View>
                  <View style={styles.mapSearchResultText}>
                    <Text style={styles.mapSearchResultTitle} numberOfLines={1}>
                      {result.title}
                    </Text>
                    <Text style={styles.mapSearchResultSubtitle} numberOfLines={1}>
                      {result.subtitle}
                    </Text>
                  </View>
                  {index < searchResults.length - 1 ? (
                    <View style={styles.mapSearchResultBorder} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <IconButton
          icon={MagnifyingGlassIcon}
          size="sm"
          onPress={openSearch}
          style={[styles.mapSearchButton, { top }]}
        />
      )}
      {!addMenuOpen ? (
        <View style={[styles.mapFilterAction, { bottom }]}>
          {filterMenuOpen ? (
            <View style={[styles.mapFilterMenu, styles.mapFilterMenuAttached]}>
              {FILTERABLE_MAP_POINT_KIND_OPTIONS.map((option, index) => {
                const IconComponent = getMapPointKindIcon(option.kind)
                const color = getMapPointKindColor(option.kind)
                const visible = !map.hiddenMapPointKinds.includes(option.kind)
                return (
                  <Pressable
                    key={option.kind}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label} visibility`}
                    accessibilityState={{ checked: visible }}
                    style={({ pressed }) => [
                      styles.mapFilterRow,
                      !visible && styles.mapFilterRowHidden,
                      pressed && styles.mapAddRowPressed,
                    ]}
                    onPress={() => map.toggleMapPointKindVisibility(option.kind)}
                  >
                    <View style={[styles.mapAddRowIcon, { borderColor: color }]}>
                      <IconComponent
                        size={16}
                        color={getMapPointKindTextColor(option.kind)}
                        weight="duotone"
                      />
                    </View>
                    <Text style={styles.mapFilterRowLabel}>{option.label}</Text>
                    {index < FILTERABLE_MAP_POINT_KIND_OPTIONS.length - 1 ? (
                      <View style={styles.mapFilterRowBorder} />
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ) : null}
          <IconButton
            icon={FunnelIcon}
            size="lg"
            onPress={toggleFilterMenu}
            style={filterMenuOpen ? styles.mapFilterButtonAttached : undefined}
          />
        </View>
      ) : null}
      {addMenuOpen ? (
        <View style={[styles.mapAddSheet, { bottom: sheetBottom }]}>
          <View style={styles.mapAddSheetHeader}>
            <View style={[styles.mapTargetIcon, { borderColor: theme.palette.cyan.color }]}>
              <PlusIcon size={18} color={theme.palette.cyan.text} weight="bold" />
            </View>
            <View style={styles.mapTargetTitleBlock}>
              <Text style={styles.mapTargetTitle} numberOfLines={1}>
                Add map feature
              </Text>
              <Text style={styles.mapTargetSubtitle} numberOfLines={1}>
                Places at the map center
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close add map feature"
              onPress={toggleAddMenu}
              style={({ pressed }) => [
                styles.mapAddCloseButton,
                pressed && styles.mapTargetClosePressed,
              ]}
            >
              <XIcon size={20} color={theme.palette.slate.textSecondary} weight="bold" />
            </Pressable>
          </View>
          <View style={styles.mapAddButtonGrid}>
            <View style={styles.mapAddCompactRow}>
              {compactMapPointOptions.map((option) => {
                const IconComponent = getMapPointKindIcon(option.kind)
                const color = getMapPointKindColor(option.kind)
                const textColor = getMapPointKindTextColor(option.kind)
                return (
                  <Pressable
                    key={option.kind}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.mapAddFeatureButton,
                      {
                        backgroundColor: theme.alpha(color, 0.12),
                        borderColor: theme.alpha(color, 0.6),
                      },
                      styles.mapAddFeatureButtonHorizontal,
                      styles.mapAddFeatureButtonCompact,
                      pressed && styles.mapAddRowPressed,
                    ]}
                    onPress={() => handleSelectMapPoint(option.kind)}
                  >
                    <IconComponent size={16} color={textColor} weight="duotone" />
                    <Text
                      style={[styles.mapAddFeatureLabel, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <View style={styles.mapAddSecondaryRow}>
              {secondaryMapPointOptions.map((option) => {
                const IconComponent = getMapPointKindIcon(option.kind)
                const color = getMapPointKindColor(option.kind)
                const textColor = getMapPointKindTextColor(option.kind)
                return (
                  <Pressable
                    key={option.kind}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.mapAddFeatureButton,
                      {
                        backgroundColor: theme.alpha(color, 0.12),
                        borderColor: theme.alpha(color, 0.6),
                      },
                      styles.mapAddFeatureButtonHorizontal,
                      styles.mapAddFeatureButtonSecondary,
                      pressed && styles.mapAddRowPressed,
                    ]}
                    onPress={() => handleSelectMapPoint(option.kind)}
                  >
                    <IconComponent size={16} color={textColor} weight="duotone" />
                    <Text
                      style={[styles.mapAddFeatureLabel, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <View style={styles.mapAddStackedButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Navigate to map center"
                onPress={() => void handleSelectNavigationPoint()}
                style={({ pressed }) => [
                  styles.mapTargetNavigate,
                  {
                    backgroundColor: theme.alpha(navigationAction.color, 0.12),
                    borderColor: navigationAction.color,
                  },
                  pressed && styles.mapTargetNavigatePressed,
                ]}
              >
                <NavigationArrowIcon size={18} color={navigationAction.textColor} weight="bold" />
                <Text style={[styles.mapTargetNavigateText, { color: navigationAction.textColor }]}>
                  Navigate
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.mapAddAction, { bottom }]}>
          <Animated.View>
            <IconButton icon={PlusIcon} size="lg" onPress={toggleAddMenu} />
          </Animated.View>
        </View>
      )}
    </>
  )
}

function MapControls({ mode, mapRef, map }: MapControlsProps) {
  const visible =
    mode === 'telemetry' ||
    mode === 'map' ||
    mode === 'weather' ||
    mode === 'legalLimits' ||
    mode === 'history'
  const showNavigationSelector = mode !== 'history' && mode !== 'weather' && mode !== 'legalLimits'
  const navigationExpanded = showNavigationSelector && map.mapSelector === 'navigation'
  const styleExpanded = map.mapSelector === 'style'
  const selectorOpen = navigationExpanded || styleExpanded

  if (!visible) return null

  return (
    <View pointerEvents="box-none" style={styles.mapControlsLayer}>
      {selectorOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close map selector"
          style={styles.mapSelectorDismissLayer}
          onPress={() => map.setMapSelector(null)}
        />
      ) : null}
      <View pointerEvents="box-none" style={styles.mapSelectors}>
        {showNavigationSelector ? (
          <MapNavigationSelector
            activeMode={map.mapNavigationMode}
            heading={map.heading}
            expanded={navigationExpanded}
            size="sm"
            onToggle={() =>
              map.setMapSelector(map.mapSelector === 'navigation' ? null : 'navigation')
            }
            onSelect={(nextMode) => {
              if (map.mapNavigationMode === 'freeRotate' && nextMode !== 'freeRotate') {
                mapRef.current?.resetRotation()
              }
              map.setMapNavigationMode(nextMode)
            }}
          />
        ) : null}
        <MapStyleSwitch
          activeKey={map.mapStyleKey}
          expanded={styleExpanded}
          size="sm"
          onToggle={() => map.setMapSelector(map.mapSelector === 'style' ? null : 'style')}
          onSelect={map.setMapStyleKey}
        />
      </View>
    </View>
  )
}

function MapModeTabs({ mode, top, map, onResetLegalSelection }: MapModeTabsProps) {
  const weather = useMapWeather(map.weatherLocation)
  const sunrise = useWeatherStore((s) => s.sunrise)
  const sunset = useWeatherStore((s) => s.sunset)
  const now = new Date()
  const hour = now.getHours()
  const isNight = isNightAtTime(hour, now.getMinutes(), sunrise, sunset)
  const weatherColor = weather
    ? weatherCodeToColor(weather.weatherCode, hour, isNight)
    : theme.palette.sky.color
  const weatherSelection = {
    bg: theme.alpha(weatherColor, 0.12),
    border: theme.alpha(weatherColor, 0.4),
    color: weatherColor,
  }
  const weatherLabel = 'Weather'
  const activeId = mode === 'legalLimits' ? 'legalLimits' : mode === 'weather' ? 'weather' : 'map'

  const WeatherModeIcon: Icon = ({ color, size, weight }) => {
    const iconSize = typeof size === 'number' ? size : 18
    return weather ? (
      <WeatherIcon
        code={weather.weatherCode}
        hour={hour}
        isNight={isNight}
        size={iconSize}
        color={weatherColor}
        weight={weight}
      />
    ) : (
      <CloudSunIcon size={size} color={color} weight={weight} />
    )
  }

  return (
    <View pointerEvents="box-none" style={[styles.mapModeTabs, { top }]}>
      <PillSelector
        activeId={activeId}
        contained
        fitContent
        style={styles.mapModePills}
        contentContainerStyle={styles.mapModePillsContent}
      >
        <PillSelectorItem
          id="map"
          label="Explore"
          icon={MapTrifoldIcon}
          activeLabelOnly
          color={theme.palette.violet}
          activeWidth={116}
          onPress={() => {
            if (mode !== 'map') {
              onResetLegalSelection()
              map.enterMapFocus()
            }
          }}
        />
        <PillSelectorItem
          id="weather"
          label={weatherLabel}
          icon={WeatherModeIcon}
          activeLabelOnly
          color={weatherSelection}
          activeWidth={142}
          inactiveWidth={58}
          badge={
            weather && activeId !== 'weather' ? (
              <View style={styles.mapModeBadge}>
                <Text style={[styles.mapModeBadgeText, { color: weatherColor }]}>
                  {weather.temperature}°
                </Text>
              </View>
            ) : null
          }
          onPress={map.enterWeather}
        />
        <PillSelectorItem
          id="legalLimits"
          label="Legal limits"
          icon={SpeedometerIcon}
          activeLabelOnly
          color={theme.palette.green}
          activeWidth={136}
          inactiveWidth={44}
          onPress={map.enterLegalLimits}
        />
      </PillSelector>
    </View>
  )
}

function CenterPlacementPointer({ color, pulseKey }: { color: string; pulseKey: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      entering={centerPlacementPointerEntering}
      exiting={FadeOut.duration(140)}
      style={styles.centerPlacementPointer}
    >
      {pulseKey > 0 ? (
        <Animated.View
          key={pulseKey}
          entering={centerPlacementPulseEntering}
          style={[styles.centerPlacementPulse, { borderColor: color }]}
        />
      ) : null}
      <View style={[styles.centerPlacementBall, { borderColor: color }]}>
        <View style={[styles.centerPlacementDot, { backgroundColor: color }]} />
      </View>
    </Animated.View>
  )
}

function MapTargetSheet({
  target,
  bottom,
  mode,
  action,
  onAddFeature,
  onEdit,
  onSave,
  onDelete,
  onDismiss,
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
  onDelete?: () => void
  onDismiss?: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const isMapPoint = target.type === 'mapPoint'
  const color = target.type === 'mapPoint' ? getMapPointKindColor(target.point.kind) : action.color
  const textColor =
    target.type === 'mapPoint' ? getMapPointKindTextColor(target.point.kind) : action.textColor
  const icon = createElement(isMapPoint ? getMapPointKindIcon(target.point.kind) : MapPinIcon, {
    size: 18,
    color: textColor,
    weight: 'duotone',
  })

  return (
    <View style={[styles.mapTargetSheet, { bottom }]}>
      <View style={styles.mapTargetHeader}>
        <View style={[styles.mapTargetIcon, { borderColor: color }]}>{icon}</View>
        <View style={styles.mapTargetTitleBlock}>
          <Text style={styles.mapTargetTitle} numberOfLines={1}>
            {isMapPoint && name.trim() ? name.trim() : target.title}
          </Text>
          <Text style={styles.mapTargetSubtitle} numberOfLines={2}>
            {target.loadingDetails
              ? 'Loading details'
              : target.subtitle || `${target.latitude.toFixed(5)}, ${target.longitude.toFixed(5)}`}
          </Text>
        </View>
        {onDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close target"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.mapTargetClose,
              pressed && styles.mapTargetClosePressed,
            ]}
          >
            <XIcon size={20} color={theme.palette.slate.textSecondary} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      {isMapPoint && mode === 'edit' ? (
        <View style={styles.mapTargetDraftFields}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={theme.palette.slate.textMuted}
            style={styles.mapTargetInput}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor={theme.palette.slate.textMuted}
            multiline
            style={[styles.mapTargetInput, styles.mapTargetDescriptionInput]}
          />
          <View style={styles.mapTargetPhotoPlaceholder}>
            <ImageSquareIcon size={18} color={theme.palette.slate.textSecondary} weight="duotone" />
            <Text style={styles.mapTargetPhotoText}>Photo</Text>
          </View>
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
                pressed && styles.mapTargetNavigatePressed,
              ]}
            >
              <TrashIcon size={18} color={theme.status.error.text} weight="bold" />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save map feature"
            onPress={onSave}
            style={({ pressed }) => [
              styles.mapTargetActionButton,
              styles.mapTargetSaveButton,
              pressed && styles.mapTargetNavigatePressed,
            ]}
          >
            <Text style={[styles.mapTargetNavigateText, styles.mapTargetSaveText]}>Save</Text>
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
                styles.mapTargetSaveButton,
                pressed && styles.mapTargetNavigatePressed,
              ]}
            >
              <PencilSimpleIcon size={18} color={theme.palette.slate.textPrimary} weight="bold" />
              <Text style={[styles.mapTargetNavigateText, styles.mapTargetSaveText]}>Edit</Text>
            </Pressable>
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
              pressed && styles.mapTargetNavigatePressed,
            ]}
          >
            <action.Icon size={18} color={action.textColor} weight="bold" />
            <Text style={[styles.mapTargetNavigateText, { color: action.textColor }]}>
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

export function MainOverlays({
  mode,
  mapRef,
  mapInteractionHandlerRef,
  board,
  map,
  history,
}: MainOverlaysProps) {
  const insets = useSafeAreaInsets()
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom * 0.5, 8) + 8
  const historyPanelBottom = Math.max(insets.bottom, 16) + 8
  const [panelHeight, setPanelHeight] = useState(0)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const [revealGestureActive, setRevealGestureActive] = useState(false)
  const revealCommittedRef = useRef(false)
  const [tuneDrawerOpen, setTuneDrawerOpen] = useState(false)
  const [legalListOpen, setLegalListOpen] = useState(false)
  const [editingMapPointId, setEditingMapPointId] = useState<string | null>(null)
  const [openAddMenuKey, setOpenAddMenuKey] = useState(0)
  const [selectedLegalCountry, setSelectedLegalCountry] = useState<LegalLimitCountry | null>(null)
  const tuneButtonRef = useRef<View>(null)
  const revealProgress = useSharedValue(0)
  const dragOpacity = useSharedValue(0)
  const telemetryReturnOpacity = useSharedValue(mode === 'telemetry' ? 1 : 0)
  const weatherLoading = useWeatherStore((s) => s.loading)
  const radarLoading = useRainViewerRadarStore((s) => s.loading)
  const refreshRadar = useRainViewerRadarStore((s) => s.fetch)
  const riderColor = useRiderStore((s) => s.riderColor)
  const legalModeActive = useSettingsStore((s) => normalizeLegalModeSettings(s.legalMode).enabled)
  const historyBusy = history.loadingSession || history.historyLoading
  const telemetryInteractive = mode === 'telemetry' && !revealGestureActive
  const legalListVisible = mode === 'legalLimits' && legalListOpen
  const legalBaseBottom = legalListVisible ? LEGAL_LIST_PANEL_HEIGHT : Math.max(insets.bottom, 16)
  const legalLegendBottom = legalBaseBottom + LEGAL_OVERLAY_GAP
  const legalListToggleBottom = legalLegendBottom + LEGAL_LEGEND_HEIGHT + LEGAL_OVERLAY_GAP
  const mapModeTabsTop = Math.max(insets.top, 8)
  const belowMapModeTabsTop = mapModeTabsTop + 48
  const mapTargetBottom = Math.max(insets.bottom, 16) + 16
  const activeNavigationTarget =
    map.activeNavigationTarget ??
    (map.directionPoint
      ? ({
          type: 'coordinate',
          id: map.directionPoint.id,
          latitude: map.directionPoint.latitude,
          longitude: map.directionPoint.longitude,
          title: 'Direction point',
          subtitle: null,
        } satisfies MapSelection)
      : null)
  const navigationActionColor = riderColor ?? theme.palette.green.color
  const navigationActionTextColor = riderColor ?? theme.palette.green.text
  const targetSheetVisible = map.selectedNavigationTarget != null || activeNavigationTarget != null
  const interfaceFadeStyle = useAnimatedStyle(() => ({
    opacity: (1 - dragOpacity.value) * telemetryReturnOpacity.value,
  }))

  const handleRemovePress = useCallback(() => {
    setRemoveConfirmVisible(true)
  }, [])

  const handleRemoveConfirm = useCallback(() => {
    setRemoveConfirmVisible(false)
    history.removeSession()
  }, [history])

  const handleRemoveCancel = useCallback(() => {
    setRemoveConfirmVisible(false)
  }, [])

  useEffect(() => {
    if (mode === 'legalLimits') return
    const frame = requestAnimationFrame(() => setSelectedLegalCountry(null))
    return () => cancelAnimationFrame(frame)
  }, [mode])

  useEffect(() => {
    if (map.selectedNavigationTarget?.type === 'mapPoint') return
    const frame = requestAnimationFrame(() => setEditingMapPointId(null))
    return () => cancelAnimationFrame(frame)
  }, [map.selectedNavigationTarget])

  const handleOpenAddFeatureAtSelectedTarget = useCallback(() => {
    const target = map.selectedNavigationTarget
    if (!target || target.type === 'mapPoint') return
    mapRef.current?.focusCoordinate([target.longitude, target.latitude])
    setEditingMapPointId(null)
    map.onDismissSelectedTarget()
    setOpenAddMenuKey((key) => key + 1)
  }, [map, mapRef])

  const resetLegalSelection = useCallback(() => {
    setLegalListOpen(false)
    setSelectedLegalCountry(null)
  }, [])

  const handleRevealPan = useCallback(
    (totalX: number, totalY: number, animationDuration?: number, revealProgress?: number) => {
      mapRef.current?.previewPanBy(totalX, totalY, animationDuration, revealProgress)
    },
    [mapRef],
  )

  const handleRevealPanStart = useCallback(() => {
    mapRef.current?.beginPreviewPan()
  }, [mapRef])

  const handleRevealZoomStart = useCallback(() => {
    mapRef.current?.beginPreviewZoom()
  }, [mapRef])

  const handleRevealZoom = useCallback(
    (scale: number) => {
      mapRef.current?.previewZoomBy(scale)
    },
    [mapRef],
  )

  const handleRevealZoomEnd = useCallback(() => {
    mapRef.current?.endPreviewZoom()
  }, [mapRef])

  const handleReveal = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } else if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
    }
    revealCommittedRef.current = true
    setRevealGestureActive(true)
    map.enterMapFocus()
  }, [map])

  const handleRevealFinish = useCallback(
    (revealed: boolean) => {
      const actuallyRevealed = revealed || revealCommittedRef.current || mode === 'map'
      if (!actuallyRevealed) {
        mapRef.current?.restorePreviewPan()
      } else {
        mapRef.current?.endPreviewPan()
      }
      revealCommittedRef.current = false
      setRevealGestureActive(false)
    },
    [mapRef, mode],
  )

  useLayoutEffect(() => {
    cancelAnimation(telemetryReturnOpacity)
    if (mode === 'telemetry') {
      revealCommittedRef.current = false
      revealProgress.value = 0
      dragOpacity.value = withTiming(0, TELEMETRY_FADE_TIMING)
      telemetryReturnOpacity.value = 0
      telemetryReturnOpacity.value = withTiming(1, TELEMETRY_FADE_TIMING)
    } else {
      telemetryReturnOpacity.value = 0
    }
  }, [dragOpacity, mode, revealProgress, telemetryReturnOpacity])

  return (
    <>
      <MapVignette
        mode={mode}
        panelHeight={mode === 'history' && history.selectedSession ? panelHeight : 0}
        visible
        fadeOutProgress={dragOpacity}
      />
      {(mode === 'telemetry' || revealGestureActive) && (
        <MapRevealGesture
          progress={revealProgress}
          dragOpacity={dragOpacity}
          onPanStart={handleRevealPanStart}
          onPan={handleRevealPan}
          onZoomStart={handleRevealZoomStart}
          onZoom={handleRevealZoom}
          onZoomEnd={handleRevealZoomEnd}
          onReveal={handleReveal}
          onFinish={handleRevealFinish}
        />
      )}

      {mode === 'map' || mode === 'weather' || mode === 'legalLimits' ? (
        <MapModeTabs
          mode={mode}
          top={mapModeTabsTop}
          map={map}
          onResetLegalSelection={resetLegalSelection}
        />
      ) : null}

      <Animated.View
        pointerEvents={telemetryInteractive ? 'box-none' : 'none'}
        style={[styles.telemetryInterface, interfaceFadeStyle]}
      >
        <LiveHud revealProgress={revealProgress} />
        <BottomTelemetryStrip revealProgress={revealProgress} />
        <TopBar
          boards={board.boards}
          activeBoardId={board.activeBoardId}
          activeBoard={board.activeBoard}
          bleStatus={board.bleStatus}
          onSelectBoard={board.onSelectBoard}
          onAddBoard={board.onAddBoard}
          onDisconnect={board.onStopScan}
          onWeatherPress={map.enterWeather}
        />
        <FloatingBar
          bleStatus={board.bleStatus}
          activeBoard={board.activeBoard}
          onStopScan={board.onStopScan}
          onRetryConnect={board.onRetryConnect}
          bottomOffset={aboveStripBottom}
        />
        <IconButton
          icon={ClockCounterClockwiseIcon}
          size="lg"
          onPress={() => void history.enterHistoryMode()}
          testID="history-button"
          style={[
            styles.historyButton,
            { bottom: aboveStripBottom - (HISTORY_BUTTON_SIZE - RECORD_BUTTON_HEIGHT) / 2 },
          ]}
        />
        <View
          ref={tuneButtonRef}
          collapsable={false}
          style={[
            styles.tuneButton,
            { bottom: aboveStripBottom - (HISTORY_BUTTON_SIZE - RECORD_BUTTON_HEIGHT) / 2 },
          ]}
        >
          <IconButton
            icon={SlidersHorizontalIcon}
            size="lg"
            onPress={() => setTuneDrawerOpen(true)}
          />
          {legalModeActive ? (
            <View style={styles.legalModeBadge}>
              <SirenIcon size={13} color={theme.palette.mono.white} weight="fill" />
            </View>
          ) : null}
        </View>
        <EdgeDrawer
          visible={tuneDrawerOpen}
          triggerRef={tuneButtonRef}
          title="Board Settings"
          icon={SlidersHorizontalIcon}
          onClose={() => setTuneDrawerOpen(false)}
        >
          <TuneDrawer
            onNavigate={() => setTuneDrawerOpen(false)}
            onOpenLegalLimits={() => {
              setTuneDrawerOpen(false)
              map.enterLegalLimits()
            }}
          />
        </EdgeDrawer>
      </Animated.View>

      <View
        pointerEvents={telemetryInteractive ? 'box-none' : 'none'}
        style={styles.telemetryOffscreenIndicators}
      >
        {mode === 'telemetry'
          ? map.offscreenMapIndicators.map((indicator) => (
              <OffscreenMapIndicator
                key={indicator.id}
                indicator={indicator}
                onPress={() => map.onOffscreenIndicatorPress(indicator)}
              />
            ))
          : null}
      </View>

      <View
        pointerEvents={mode === 'map' ? 'box-none' : 'none'}
        style={[styles.mapInterface, mode === 'map' ? styles.visible : styles.hidden]}
      >
        {mode === 'map' && !targetSheetVisible ? (
          <FullMapControls
            mapRef={mapRef}
            map={map}
            mapInteractionHandlerRef={mapInteractionHandlerRef}
            top={mapModeTabsTop}
            bottom={aboveStripBottom - 112}
            sheetBottom={mapTargetBottom}
            openAddMenuKey={openAddMenuKey}
            onBeginEditMapPoint={setEditingMapPointId}
          />
        ) : null}
        {mode === 'map' && map.selectedNavigationTarget ? (
          <MapTargetSheet
            key={map.selectedNavigationTarget.id}
            target={map.selectedNavigationTarget}
            bottom={mapTargetBottom}
            mode={
              map.selectedNavigationTarget.type === 'mapPoint' &&
              editingMapPointId === map.selectedNavigationTarget.id
                ? 'edit'
                : 'select'
            }
            action={{
              label:
                map.selectedNavigationTarget.type === 'mapPoint' &&
                editingMapPointId === map.selectedNavigationTarget.id
                  ? 'Save'
                  : 'Navigate',
              accessibilityLabel:
                map.selectedNavigationTarget.type === 'mapPoint' &&
                editingMapPointId === map.selectedNavigationTarget.id
                  ? 'Save map feature'
                  : 'Navigate to target',
              color: navigationActionColor,
              textColor: navigationActionTextColor,
              borderColor: navigationActionColor,
              bgColor: theme.alpha(navigationActionColor, 0.12),
              Icon: NavigationArrowIcon,
              onPress: () => void map.onNavigateSelectedTarget(),
            }}
            onAddFeature={
              map.selectedNavigationTarget.type === 'mapPoint'
                ? undefined
                : handleOpenAddFeatureAtSelectedTarget
            }
            onEdit={
              map.selectedNavigationTarget.type === 'mapPoint'
                ? () => setEditingMapPointId(map.selectedNavigationTarget?.id ?? null)
                : undefined
            }
            onSave={() => setEditingMapPointId(null)}
            onDelete={
              map.selectedNavigationTarget.type === 'mapPoint'
                ? () => {
                    const id = map.selectedNavigationTarget?.id
                    if (!id) return
                    setEditingMapPointId(null)
                    map.onRemoveMapPoint(id)
                  }
                : undefined
            }
            onDismiss={() => {
              setEditingMapPointId(null)
              map.onDismissSelectedTarget()
            }}
          />
        ) : null}
        {mode === 'map' && !map.selectedNavigationTarget && activeNavigationTarget ? (
          <MapTargetSheet
            key={activeNavigationTarget.id}
            target={activeNavigationTarget}
            bottom={mapTargetBottom}
            mode="navigation"
            action={{
              label: 'Cancel navigation',
              accessibilityLabel: 'Cancel navigation',
              color: navigationActionColor,
              textColor: navigationActionTextColor,
              borderColor: navigationActionColor,
              bgColor: theme.alpha(navigationActionColor, 0.12),
              Icon: XIcon,
              onPress: map.onCancelNavigation,
            }}
          />
        ) : null}
      </View>

      <MapControls mode={mode} mapRef={mapRef} map={map} />

      <View
        pointerEvents={mode === 'weather' ? 'box-none' : 'none'}
        style={[styles.weatherInterface, mode === 'weather' ? styles.visible : styles.hidden]}
      >
        <IconButton
          icon={ArrowLeftIcon}
          size="sm"
          accessibilityLabel="Back from weather"
          onPress={map.exitWeather}
          style={[styles.mapTopBackButton, { top: mapModeTabsTop }]}
        />
        <IconButton
          icon={ArrowsClockwiseIcon}
          onPress={() => {
            map.refreshWeather()
            refreshRadar(true)
          }}
          loading={weatherLoading || radarLoading}
          style={[styles.weatherRefreshButton, { top: mapModeTabsTop }]}
        />
        <View
          pointerEvents="none"
          style={[styles.weatherExpandedPill, { top: belowMapModeTabsTop }]}
        >
          <WeatherPill location={map.weatherLocation} expanded onPress={() => undefined} />
        </View>
        <View
          style={[
            styles.weatherRadarTimelineContainer,
            { bottom: Math.max(insets.bottom, 16) + 112 },
          ]}
        >
          {mode === 'weather' ? <WeatherRadarTimeline /> : null}
        </View>
        <View
          style={[styles.weatherHourlyContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <WeatherHourlyStrip />
        </View>
      </View>

      <View
        pointerEvents={mode === 'legalLimits' ? 'box-none' : 'none'}
        style={[
          styles.legalLimitsInterface,
          mode === 'legalLimits' ? styles.visible : styles.hidden,
        ]}
      >
        <IconButton
          icon={ArrowLeftIcon}
          size="sm"
          accessibilityLabel="Exit legal limits"
          onPress={map.exitLegalLimits}
          style={[styles.mapTopBackButton, { top: mapModeTabsTop }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            legalListVisible ? 'Hide legal limits list' : 'Show legal limits list'
          }
          onPress={() => setLegalListOpen((open) => !open)}
          style={({ pressed }) => [
            styles.legalListToggle,
            {
              bottom: legalListToggleBottom,
            },
            pressed && styles.legalListTogglePressed,
          ]}
        >
          {legalListVisible ? (
            <CaretDownIcon size={18} color={theme.palette.slate.textSecondary} weight="bold" />
          ) : (
            <CaretUpIcon size={18} color={theme.palette.slate.textSecondary} weight="bold" />
          )}
          <Text style={styles.legalListToggleLabel}>
            {legalListVisible ? 'HIDE LIST' : 'SHOW LIST'}
          </Text>
        </Pressable>
        <View
          pointerEvents="none"
          style={[
            styles.legalLegend,
            {
              bottom: legalLegendBottom,
            },
          ]}
        >
          {LEGAL_ROAD_STATUS_LEGEND.map((status) => (
            <View key={status} style={styles.legalLegendItem}>
              <View
                style={[
                  styles.legalLegendDot,
                  { backgroundColor: LEGAL_ROAD_STATUS_COLORS[status] },
                ]}
              />
              <Text style={styles.legalLegendText}>{LEGAL_ROAD_STATUS_LABELS[status]}</Text>
            </View>
          ))}
        </View>
        {legalListVisible ? (
          <View style={[styles.legalListPanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.legalListContent}
            >
              {LEGAL_LIMIT_COUNTRIES.map((country) => (
                <Pressable
                  key={country.code}
                  accessibilityRole="button"
                  accessibilityLabel={`${country.name} legal limits`}
                  style={({ pressed }) => [
                    styles.legalCountryRow,
                    pressed && styles.legalCountryRowPressed,
                  ]}
                  onPress={() => setSelectedLegalCountry(country)}
                >
                  <View
                    style={[
                      styles.legalCountryDot,
                      { backgroundColor: LEGAL_ROAD_STATUS_COLORS[country.status] },
                    ]}
                  />
                  <Text style={styles.legalCountryName} numberOfLines={1}>
                    {country.name}
                  </Text>
                  <Text style={styles.legalCountryStatus} numberOfLines={1}>
                    {LEGAL_ROAD_STATUS_LABELS[country.status]}
                  </Text>
                  <Text style={styles.legalCountrySpeed}>
                    {country.referenceSpeedKmh == null
                      ? 'N/A'
                      : `${country.referenceSpeedKmh} km/h`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <LegalLimitCountrySheet
          country={mode === 'legalLimits' ? selectedLegalCountry : null}
          onClose={() => setSelectedLegalCountry(null)}
        />
      </View>

      {mode === 'history' && history.selectedSession && (
        <>
          {historyBusy && (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator size="small" color={theme.palette.sky.color} />
            </View>
          )}
          <HistoryTelemetryPanel
            startAtMs={history.selectedSession.startAtMs}
            endAtMs={history.selectedSession.endAtMs}
            movingStartAtMs={history.selectedSession.movingStartAtMs}
            movingEndAtMs={history.selectedSession.movingEndAtMs}
            deviceName={history.selectedSession.deviceName}
            samples={history.sessionSamples}
            canPrevious={history.canPreviousRide}
            canNext={!!history.nextRide}
            mediaAssets={history.mediaHistory.assets}
            mediaUnmatched={history.mediaHistory.unmatched}
            mediaLoading={history.mediaHistory.loading}
            mediaError={history.mediaHistory.error}
            onPrevious={() => {
              void history.selectPreviousRide()
            }}
            onNext={() => {
              void history.selectNextRide()
            }}
            onOpenList={() => history.setHistorySheetVisible(true)}
            onAddMedia={() => void history.mediaHistory.add()}
            onOpenMedia={history.openMedia}
            onSeek={history.onSeek}
            onMetricInteraction={history.setActiveHistoryMapMetric}
            onHeightChange={setPanelHeight}
          />
          <HistoryStatsBar session={history.selectedSession} />
          <HistoryControls
            loading={historyBusy}
            canRemove={true}
            onBack={history.exitHistory}
            onRemove={handleRemovePress}
          />
        </>
      )}

      {mode === 'history' && !history.selectedSession && (
        <>
          {historyBusy ? (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator size="small" color={theme.palette.sky.color} />
            </View>
          ) : (
            <HistoryEmptyState />
          )}
          <HistoryControls
            loading={historyBusy}
            canRemove={false}
            onBack={history.exitHistory}
            onRemove={() => undefined}
          />
        </>
      )}

      <HistorySessionSheet
        visible={history.historySheetVisible}
        bottomOffset={historyPanelBottom + panelHeight + 8}
        blocks={history.blocks}
        sessions={history.sessions}
        selectedSessionId={history.selectedSession?.id ?? null}
        hasMore={history.historyHasMore}
        loadingMore={history.historyLoading}
        onClose={() => history.setHistorySheetVisible(false)}
        onSelectSession={(session) => {
          history.setHistorySheetVisible(false)
          history.selectRide(session)
        }}
        onLoadMore={() => {
          void history.loadMoreHistory()
        }}
      />

      {mode === 'history' && history.historyError ? (
        <View style={[styles.historyError, { bottom: aboveStripBottom }]}>
          <Text style={styles.historyErrorText} selectable>
            {history.historyError}
          </Text>
        </View>
      ) : null}

      {history.openMediaAssetId ? (
        <MediaHistoryViewer
          key={history.openMediaAssetId}
          assets={[...history.mediaHistory.assets, ...history.mediaHistory.unmatched]}
          initialAssetId={history.openMediaAssetId}
          samples={history.sessionSamples}
          markers={history.sessionMarkers}
          onClose={history.closeMedia}
        />
      ) : null}

      <ConfirmModal
        visible={removeConfirmVisible}
        title="Delete Ride"
        message="This ride and all its telemetry data will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={handleRemoveConfirm}
        onCancel={handleRemoveCancel}
      />
    </>
  )
}

const styles = StyleSheet.create({
  mapModeTabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 43,
  },
  mapModePills: {
    alignSelf: 'center',
  },
  mapModePillsContent: {
    justifyContent: 'center',
  },
  mapModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  mapModeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  mapTopBackButton: {
    position: 'absolute',
    left: 12,
    zIndex: 32,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  },
  mapSearchButton: {
    position: 'absolute',
    right: 12,
    zIndex: 44,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  },
  mapSearchSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 44,
    gap: 8,
  },
  mapSearchBar: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 0,
  },
  mapSearchInput: {
    flex: 1,
    minWidth: 0,
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 10,
  },
  mapSearchClose: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapSearchClosePressed: {
    opacity: 0.55,
  },
  mapSearchResults: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
  },
  mapSearchStatusRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  mapSearchStatusText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  mapSearchErrorText: {
    color: theme.status.error.text,
    fontSize: 12,
    fontWeight: '700',
  },
  mapSearchResult: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 14,
    position: 'relative',
  },
  mapSearchResultPressed: {
    opacity: 0.55,
  },
  mapSearchResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.palette.green.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  mapSearchResultText: {
    flex: 1,
    minWidth: 0,
  },
  mapSearchResultTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  mapSearchResultSubtitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  mapSearchResultBorder: {
    position: 'absolute',
    left: 54,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  mapSelectors: {
    position: 'absolute',
    left: 12,
    top: '50%',
    marginTop: -42,
    zIndex: 30,
    alignItems: 'flex-start',
    gap: 8,
  },
  mapAddAction: {
    position: 'absolute',
    right: 12,
    zIndex: 31,
    alignItems: 'flex-end',
    gap: 0,
  },
  mapAddSheet: {
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
  mapAddSheetHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapAddCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapAddButtonGrid: {
    gap: 8,
  },
  mapFilterAction: {
    position: 'absolute',
    left: 12,
    zIndex: 31,
    alignItems: 'flex-start',
    gap: 0,
  },
  mapFilterMenu: {
    minWidth: 178,
    alignItems: 'stretch',
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  mapFilterMenuAttached: {
    borderBottomLeftRadius: 5,
  },
  mapFilterButtonAttached: {
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  mapFilterRow: {
    height: 42,
    paddingLeft: 5,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  mapFilterRowHidden: {
    opacity: 0.38,
  },
  mapFilterRowLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  mapFilterRowBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  mapAddCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapAddFeatureButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapAddFeatureButtonCompact: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingHorizontal: 6,
  },
  mapAddStackedButtons: {
    gap: 8,
  },
  mapAddSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapAddFeatureButtonSecondary: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingHorizontal: 8,
  },
  mapAddFeatureButtonHorizontal: {
    flexDirection: 'row',
  },
  mapAddFeatureLabel: {
    maxWidth: '100%',
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapAddRowPressed: {
    opacity: 0.55,
  },
  mapAddRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  centerPlacementPointer: {
    ...StyleSheet.absoluteFill,
    zIndex: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlacementBall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.4),
  },
  centerPlacementPulse: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.3),
  },
  centerPlacementDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  mapTargetHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapTargetIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  mapTargetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  mapTargetTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  mapTargetSubtitle: {
    marginTop: 2,
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  mapTargetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTargetClosePressed: {
    opacity: 0.55,
  },
  mapTargetDraftFields: {
    gap: 8,
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
  mapTargetDescriptionInput: {
    minHeight: 72,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  mapTargetPhotoPlaceholder: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.4),
  },
  mapTargetPhotoText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  mapTargetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  mapTargetDeleteButton: {
    backgroundColor: theme.status.error.bg,
    borderColor: theme.status.error.border,
  },
  mapTargetSaveButton: {
    backgroundColor: theme.palette.cyan.border,
    borderColor: theme.palette.cyan.border,
  },
  mapTargetSaveText: {
    color: theme.palette.slate.textPrimary,
  },
  mapTargetDeleteIconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  mapTargetNavigate: {
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
  mapTargetNavigatePressed: {
    opacity: 0.55,
  },
  mapTargetNavigateText: {
    color: theme.palette.green.text,
    fontSize: 13,
    fontWeight: '900',
  },
  telemetryInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
  },
  telemetryOffscreenIndicators: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
  },
  mapInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 44,
  },
  mapControlsLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 41,
  },
  mapSelectorDismissLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  weatherInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 8,
  },
  legalLimitsInterface: {
    ...StyleSheet.absoluteFill,
    zIndex: 9,
  },
  weatherRefreshButton: {
    position: 'absolute',
    right: 10,
    zIndex: 30,
  },
  weatherExpandedPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 29,
  },
  weatherRadarTimelineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 31,
  },
  weatherHourlyContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  legalLegend: {
    position: 'absolute',
    left: 54,
    right: 54,
    zIndex: 28,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    gap: 8,
  },
  legalLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legalLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legalLegendText: {
    color: theme.palette.mono.white,
    fontSize: 9,
    fontWeight: '800',
    textShadowColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.6),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  legalListToggle: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: LEGAL_LIST_TOGGLE_HEIGHT,
    paddingHorizontal: 16,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    zIndex: 31,
  },
  legalListTogglePressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  legalListToggleLabel: {
    color: theme.palette.slate.textSecondary,
    fontSize: 11,
    fontWeight: '900',
  },
  legalListPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: LEGAL_LIST_PANEL_HEIGHT,
    paddingTop: 14,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderTopWidth: 1,
    borderTopColor: theme.palette.slate.border,
    zIndex: 30,
  },
  legalListContent: {
    gap: 8,
  },
  legalCountryRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 2,
  },
  legalCountryRowPressed: {
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.12),
  },
  legalCountryDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legalCountryName: {
    flex: 1.1,
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  legalCountryStatus: {
    flex: 0.9,
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  legalCountrySpeed: {
    width: 56,
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  visible: {
    opacity: 1,
  },
  hidden: {
    opacity: 0,
  },
  historyButton: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
  },
  tuneButton: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
  },
  legalModeBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.status.error.color,
    borderWidth: 2,
    borderColor: theme.palette.slate.surfaceDeep,
  },
  historyError: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 25,
    borderRadius: 10,
    padding: 10,
    backgroundColor: theme.status.error.bg,
    borderWidth: 1,
    borderColor: theme.status.error.bg,
  },
  historyErrorText: {
    color: theme.status.error.text,
    fontSize: 12,
    fontWeight: '700',
  },
  mapLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.6),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    transform: [{ translateX: -17 }, { translateY: -17 }],
  },
})

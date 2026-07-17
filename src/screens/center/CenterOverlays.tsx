import * as Haptics from 'expo-haptics'
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  CloudSunIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  MapPinIcon,
  FunnelIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SirenIcon,
  SpeedometerIcon,
  XIcon,
  type Icon,
} from 'phosphor-react-native'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { Text } from '@/components/ui/base/Text'
import Animated, {
  cancelAnimation,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { HistoryMarker, MapPointKind } from 'vesc-ble'

import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { EdgeDrawer } from '@/components/ui/overlays/AnchoredSheet'
import { MediaHistoryViewer } from '@/components/domain/history/MediaHistoryViewer'
import { FloatingBar } from '@/components/domain/main/FloatingBar'
import { HistorySessionSheet } from '@/components/domain/history/HistorySessionSheet'
import { IconButton } from '@/components/ui/base/IconButton'
import { MapNavigationSelector } from '@/components/ui/controls/MapNavigationSelector'
import { MapStyleSwitch } from '@/components/ui/controls/MapStyleSwitch'
import { PillSelector, PillSelectorItem } from '@/components/ui/controls/PillSelector'
import { WeatherIcon } from '@/components/ui/weather/WeatherIcon'
import type { MapNavigationMode, MapStyleKey } from '@/constants/mapStyles'
import { getMapPointKindIcon } from '@/constants/mapPointIcons'
import {
  FILTERABLE_MAP_POINT_KIND_OPTIONS,
  getMapPointKindColor,
  getMapPointKindTextColor,
  MAP_POINT_KIND_OPTIONS,
} from '@/constants/mapPoints'
import { theme } from '@/constants/theme'
import { searchMapResults, type MapSearchResult } from '@/lib/map/search'
import type { HistoryMetricKey } from '@/lib/history/metricColorScale'
import { BottomTelemetryStrip, STRIP_CONTENT_HEIGHT } from '@/screens/center/BottomTelemetryStrip'
import { type CenterMapHandle } from '@/screens/center/CenterMap'
import {
  OffscreenMapIndicator,
  type OffscreenMapIndicatorState,
} from '@/screens/center/offscreenMapIndicators'
import type { MapSelector } from '@/screens/center/centerScreenStore'
import type { CenterViewState } from '@/screens/center/centerViewState'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { HistoryEmptyState } from '@/screens/center/HistoryEmptyState'
import { WeatherHourlyStrip } from '@/screens/center/WeatherHourlyStrip'
import { WeatherPill } from '@/screens/center/WeatherPill'
import { WeatherRadarTimeline } from '@/screens/center/WeatherRadarTimeline'
import { useMapWeather } from '@/screens/center/useMapWeather'
import { HistoryStatsBar } from '@/screens/center/HistoryStatsBar'
import { HistoryTelemetryPanel } from '@/screens/center/HistoryTelemetryPanel'
import { LegalLimitCountrySheet } from '@/screens/center/LegalLimitCountrySheet'
import { LiveHud } from '@/screens/center/LiveHud'
import { MapRevealGesture } from '@/screens/center/MapRevealGesture'
import { MapVignette } from '@/screens/center/MapVignette'
import { TopBar } from '@/screens/center/TopBar'
import { TuneDrawer } from '@/screens/center/TuneDrawer'
import type { Board } from '@/store/boardStore'
import type { HistorySession, TelemetryMinuteBucket, TelemetrySample } from '@/store/historyStore'
import type { MediaAssetInput, MediaHistoryAsset } from '@/lib/history/mediaHistory'
import { useWeatherStore } from '@/store/weatherStore'
import { useRainViewerRadarStore } from '@/store/rainViewerRadarStore'
import { isNightAtTime, weatherCodeToColor } from '@/lib/weather'
import { normalizeLegalModeSettings } from '@/lib/legalMode'
import {
  LEGAL_LIMIT_COUNTRIES,
  LEGAL_ROAD_STATUS_COLORS,
  LEGAL_ROAD_STATUS_LEGEND,
  LEGAL_ROAD_STATUS_LABELS,
  type LegalLimitCountry,
} from '@/lib/legal/legalLimits'
import { useSettingsStore } from '@/store/settingsStore'

interface CenterBoardOverlayProps {
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
}

interface CenterMapOverlayProps {
  heading: SharedValue<number>
  mapStyleKey: MapStyleKey
  setMapStyleKey: (key: MapStyleKey) => void
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
  replaceDirectionPoint: (latitude: number, longitude: number) => Promise<unknown>
  addMapPoint: (kind: MapPointKind, latitude: number, longitude: number) => Promise<unknown>
  hiddenMapPointKinds: MapPointKind[]
  toggleMapPointKindVisibility: (kind: MapPointKind) => void
  offscreenMapIndicators: OffscreenMapIndicatorState[]
  onOffscreenIndicatorPress: (indicator: OffscreenMapIndicatorState) => void
}

interface CenterHistoryOverlayProps {
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

interface CenterOverlaysProps {
  mode: CenterViewState
  mapRef: RefObject<CenterMapHandle | null>
  mapInteractionHandlerRef: RefObject<() => void>
  board: CenterBoardOverlayProps
  map: CenterMapOverlayProps
  history: CenterHistoryOverlayProps
}

const RECORD_BUTTON_HEIGHT = 48
const HISTORY_BUTTON_SIZE = 54
const TELEMETRY_FADE_TIMING = { duration: 260 } as const
const COMPACT_MAP_POINT_KINDS: readonly MapPointKind[] = ['drop', 'bonk', 'nose_slide']

function isCompactMapPointKind(kind: MapPointKind) {
  return COMPACT_MAP_POINT_KINDS.includes(kind)
}

interface FullMapControlsProps {
  mapRef: RefObject<CenterMapHandle | null>
  map: CenterMapOverlayProps
  mapInteractionHandlerRef: RefObject<() => void>
  top: number
  bottom: number
}

interface MapControlsProps {
  mode: CenterViewState
  mapRef: RefObject<CenterMapHandle | null>
  map: CenterMapOverlayProps
}

interface MapModeTabsProps {
  mode: CenterViewState
  top: number
  map: CenterMapOverlayProps
  onResetLegalSelection: () => void
}

function useMapSearch({
  searchOpen,
  weatherLocation,
}: {
  searchOpen: boolean
  weatherLocation: CenterMapOverlayProps['weatherLocation']
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchCacheRef = useRef<Map<string, MapSearchResult[]>>(new Map())
  const searchRequestIdRef = useRef(0)
  const normalizedSearchQuery = searchQuery.trim()
  const weatherLatitude = weatherLocation?.latitude ?? null
  const weatherLongitude = weatherLocation?.longitude ?? null
  const searchProximity = useMemo(
    () =>
      weatherLatitude == null || weatherLongitude == null
        ? null
        : { latitude: weatherLatitude, longitude: weatherLongitude },
    [weatherLatitude, weatherLongitude],
  )
  const searchProximityKey =
    weatherLatitude == null || weatherLongitude == null
      ? 'none'
      : `${weatherLatitude.toFixed(4)},${weatherLongitude.toFixed(4)}`

  useEffect(() => {
    if (!searchOpen || normalizedSearchQuery.length < 2) {
      searchRequestIdRef.current += 1
      return
    }

    const cacheKey = `${normalizedSearchQuery}|${searchProximityKey}`
    const cached = searchCacheRef.current.get(cacheKey)
    if (cached) {
      setSearchResults(cached)
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId
    const timeout = setTimeout(() => {
      setSearchLoading(true)
      void searchMapResults(normalizedSearchQuery, {
        proximity: searchProximity,
        signal: controller.signal,
      })
        .then((results) => {
          if (requestId !== searchRequestIdRef.current) return
          searchCacheRef.current.set(cacheKey, results)
          setSearchResults(results)
          setSearchError(null)
          setSearchLoading(false)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          if (requestId !== searchRequestIdRef.current) return
          setSearchResults([])
          setSearchError(error instanceof Error ? error.message : 'Mapbox search failed')
          setSearchLoading(false)
        })
    }, 260)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [normalizedSearchQuery, searchOpen, searchProximity, searchProximityKey])

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query)
    setSearchError(null)
    if (query.trim().length < 2) {
      searchRequestIdRef.current += 1
      setSearchResults([])
      setSearchLoading(false)
    }
  }, [])

  const resetSearch = useCallback(() => {
    searchRequestIdRef.current += 1
    setSearchQuery('')
    setSearchResults([])
    setSearchError(null)
    setSearchLoading(false)
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    handleSearchQueryChange,
    resetSearch,
  }
}

const centerPlacementPointerEntering = () => {
  'worklet'
  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: 1.8 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 260 }),
      transform: [{ scale: withTiming(1, { duration: 260 }) }],
    },
  }
}

function FullMapControls({
  mapRef,
  map,
  mapInteractionHandlerRef,
  top,
  bottom,
}: FullMapControlsProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    handleSearchQueryChange,
    resetSearch,
  } = useMapSearch({ searchOpen, weatherLocation: map.weatherLocation })

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    resetSearch()
  }, [resetSearch])

  useEffect(() => {
    const dismissTransientControls = () => {
      if (!searchOpen && !addMenuOpen && !filterMenuOpen) return
      closeSearch()
      setAddMenuOpen(false)
      setFilterMenuOpen(false)
    }
    mapInteractionHandlerRef.current = dismissTransientControls
    return () => {
      if (mapInteractionHandlerRef.current === dismissTransientControls) {
        mapInteractionHandlerRef.current = () => {}
      }
    }
  }, [addMenuOpen, closeSearch, filterMenuOpen, mapInteractionHandlerRef, searchOpen])

  const handleSearchSelect = useCallback(
    (result: MapSearchResult) => {
      setSearchOpen(false)
      setSearchQuery(result.title)
      mapRef.current?.focusCoordinate([result.longitude, result.latitude])
      void map.replaceDirectionPoint(result.latitude, result.longitude)
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
    mapRef.current?.zoomBy(addMenuOpen ? -0.45 : 0.45)
    setAddMenuOpen(!addMenuOpen)
  }, [addMenuOpen, mapRef])

  const toggleFilterMenu = useCallback(() => {
    if (addMenuOpen) mapRef.current?.zoomBy(-0.45)
    setAddMenuOpen(false)
    setFilterMenuOpen((open) => !open)
  }, [addMenuOpen, mapRef])

  const handleSelectMapPoint = useCallback(
    async (kind: MapPointKind) => {
      const center = await mapRef.current?.getViewfinderCoordinate()
      if (!center) return
      mapRef.current?.zoomBy(-0.45)
      setAddMenuOpen(false)
      void map.addMapPoint(kind, center.latitude, center.longitude)
    },
    [map, mapRef],
  )
  const compactMapPointOptions = MAP_POINT_KIND_OPTIONS.filter((option) =>
    isCompactMapPointKind(option.kind),
  )
  const stackedMapPointOptions = MAP_POINT_KIND_OPTIONS.filter(
    (option) => !isCompactMapPointKind(option.kind),
  )

  return (
    <>
      {addMenuOpen ? <CenterPlacementPointer /> : null}
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
      <View style={[styles.mapAddAction, { bottom }]}>
        {addMenuOpen ? (
          <View style={[styles.mapAddMenu, styles.mapAddMenuAttached]}>
            <View style={styles.mapAddCompactRow}>
              {compactMapPointOptions.map((option, index) => {
                const IconComponent = getMapPointKindIcon(option.kind)
                const color = getMapPointKindColor(option.kind)
                return (
                  <Pressable
                    key={option.kind}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.mapAddCompactItem,
                      pressed && styles.mapAddRowPressed,
                    ]}
                    onPress={() => handleSelectMapPoint(option.kind)}
                  >
                    <View style={[styles.mapAddRowIcon, { borderColor: color }]}>
                      <IconComponent
                        size={16}
                        color={getMapPointKindTextColor(option.kind)}
                        weight="duotone"
                      />
                    </View>
                    {index < compactMapPointOptions.length - 1 ? (
                      <View style={styles.mapAddCompactDivider} />
                    ) : null}
                  </Pressable>
                )
              })}
              <View style={styles.mapAddRowBorder} />
            </View>
            {stackedMapPointOptions.map((option, index) => {
              const IconComponent = getMapPointKindIcon(option.kind)
              const color = getMapPointKindColor(option.kind)
              return (
                <Pressable
                  key={option.kind}
                  style={({ pressed }) => [styles.mapAddRow, pressed && styles.mapAddRowPressed]}
                  onPress={() => handleSelectMapPoint(option.kind)}
                >
                  <Text style={styles.mapAddRowLabel}>{option.label}</Text>
                  <View style={[styles.mapAddRowIcon, { borderColor: color }]}>
                    <IconComponent
                      size={16}
                      color={getMapPointKindTextColor(option.kind)}
                      weight="duotone"
                    />
                  </View>
                  {index < stackedMapPointOptions.length - 1 ? (
                    <View style={styles.mapAddRowBorder} />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}
        <Animated.View>
          <IconButton
            icon={addMenuOpen ? XIcon : PlusIcon}
            size="lg"
            onPress={toggleAddMenu}
            style={addMenuOpen ? styles.mapAddButtonAttached : undefined}
          />
        </Animated.View>
      </View>
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
  const weatherTabColor = theme.palette.sky
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
          color={{
            bg: weatherTabColor.bg,
            border: weatherTabColor.border,
            color: weatherColor,
          }}
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

function CenterPlacementPointer() {
  return (
    <Animated.View
      pointerEvents="none"
      entering={centerPlacementPointerEntering}
      exiting={FadeOut.duration(140)}
      style={styles.centerPlacementPointer}
    >
      <View style={styles.centerPlacementBall} />
      <View style={styles.centerPlacementDot} />
    </Animated.View>
  )
}

export function CenterOverlays({
  mode,
  mapRef,
  mapInteractionHandlerRef,
  board,
  map,
  history,
}: CenterOverlaysProps) {
  const insets = useSafeAreaInsets()
  const aboveStripBottom = STRIP_CONTENT_HEIGHT + Math.max(insets.bottom * 0.5, 8) + 8
  const historyPanelBottom = Math.max(insets.bottom, 16) + 8
  const [panelHeight, setPanelHeight] = useState(0)
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false)
  const [revealGestureActive, setRevealGestureActive] = useState(false)
  const [tuneDrawerOpen, setTuneDrawerOpen] = useState(false)
  const [legalListOpen, setLegalListOpen] = useState(false)
  const [selectedLegalCountry, setSelectedLegalCountry] = useState<LegalLimitCountry | null>(null)
  const tuneButtonRef = useRef<View>(null)
  const revealProgress = useSharedValue(0)
  const dragOpacity = useSharedValue(0)
  const telemetryReturnOpacity = useSharedValue(mode === 'telemetry' ? 1 : 0)
  const weatherLoading = useWeatherStore((s) => s.loading)
  const radarLoading = useRainViewerRadarStore((s) => s.loading)
  const refreshRadar = useRainViewerRadarStore((s) => s.fetch)
  const legalModeActive = useSettingsStore((s) => normalizeLegalModeSettings(s.legalMode).enabled)
  const historyBusy = history.loadingSession || history.historyLoading
  const telemetryInteractive = mode === 'telemetry' && !revealGestureActive
  const legalListVisible = mode === 'legalLimits' && legalListOpen
  const mapModeTabsTop = Math.max(insets.top, 8)
  const belowMapModeTabsTop = mapModeTabsTop + 48
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
    setRevealGestureActive(true)
    map.enterMapFocus()
  }, [map])

  const handleRevealFinish = useCallback(
    (revealed: boolean) => {
      const actuallyRevealed = revealed || mode === 'map'
      if (!actuallyRevealed) {
        mapRef.current?.restorePreviewPan()
      } else {
        mapRef.current?.endPreviewPan()
      }
      setRevealGestureActive(false)
    },
    [mapRef, mode],
  )

  useLayoutEffect(() => {
    cancelAnimation(telemetryReturnOpacity)
    if (mode === 'telemetry') {
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
        visible={mode !== 'map'}
        topOnly={mode === 'legalLimits'}
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
        {mode === 'map' ? (
          <FullMapControls
            mapRef={mapRef}
            map={map}
            mapInteractionHandlerRef={mapInteractionHandlerRef}
            top={mapModeTabsTop}
            bottom={aboveStripBottom - 112}
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
          accessibilityLabel="Back from legal limits"
          onPress={map.exitLegalLimits}
          style={[styles.mapTopBackButton, { top: mapModeTabsTop }]}
        />
        <View pointerEvents="none" style={[styles.legalLegend, { top: belowMapModeTabsTop }]}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            legalListVisible ? 'Hide legal limits list' : 'Show legal limits list'
          }
          onPress={() => setLegalListOpen((open) => !open)}
          style={({ pressed }) => [
            styles.legalListToggle,
            {
              bottom: legalListVisible
                ? Math.max(insets.bottom, 16) + 280
                : Math.max(insets.bottom, 16),
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
                  <Text style={styles.legalCountrySpeed}>{country.legalSpeedKmh} km/h</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <LegalLimitCountrySheet
          country={selectedLegalCountry}
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
  mapAddMenu: {
    minWidth: 178,
    alignItems: 'stretch',
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  mapAddMenuAttached: {
    borderBottomRightRadius: 5,
  },
  mapAddButtonAttached: {
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  mapAddRow: {
    height: 42,
    paddingLeft: 16,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapAddCompactRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  mapAddCompactItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mapAddCompactDivider: {
    position: 'absolute',
    top: 7,
    right: 0,
    bottom: 7,
    width: 1,
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  mapAddRowBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.3),
  },
  mapAddRowPressed: {
    opacity: 0.55,
  },
  mapAddRowLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 12,
    fontWeight: '800',
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
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.palette.slate.textPrimary,
    backgroundColor: theme.alpha(theme.palette.mono.black, 0),
  },
  centerPlacementDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.palette.slate.textPrimary,
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
    minHeight: 42,
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
    maxHeight: 280,
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
    right: 12,
    zIndex: 20,
  },
  tuneButton: {
    position: 'absolute',
    left: 12,
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

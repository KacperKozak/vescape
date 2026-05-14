# Map-First Center Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-tab main screen with one full-screen map experience that keeps speed/duty prominent, uses one Mapbox instance, and reviews ride history on that same map.

**Architecture:** `src/app/index.tsx` becomes lifecycle/bootstrap + one `CenterScreen`. `CenterScreen` owns the single Mapbox camera and high-level UI state, while focused components render map layers, floating board controls, live HUD, bottom telemetry strip, map controls, and ride review controls. Pure helper logic for ride review and map focus is tested separately.

**Tech Stack:** Expo Router, React Native, `@rnmapbox/maps`, Zustand, `react-native-reanimated`, `phosphor-react-native`, Bun test/TypeScript.

---

## File Structure

- Create `src/screens/center/centerState.ts`
  - Pure helpers for focus/ride state: latest session, previous/next session, visibility flags.
- Create `src/screens/center/centerState.test.ts`
  - Unit tests for helper behavior.
- Create `src/screens/center/CenterMap.tsx`
  - Single `Mapbox.MapView`, live layers, ride review layers, shared camera ref callbacks.
- Create `src/screens/center/TopBar.tsx`
  - Compact floating board selector/edit/disconnect pill. Reuses `BoardSelectorSheet`.
- Create `src/screens/center/LiveHud.tsx`
  - Tappable speed, duty, battery, temperature HUD.
- Create `src/screens/center/BottomTelemetryStrip.tsx`
  - Compact bottom telemetry strip for temperatures, currents, footpad, IMU.
- Create `src/screens/center/HistoryControls.tsx`
  - Back, previous ride, next ride, rides list buttons.
- Modify `src/screens/CenterScreen.tsx`
  - Replace telemetry-card screen with map shell and overlay orchestration.
- Modify `src/app/index.tsx`
  - Remove pager/tabs/old top status rows, render only `CenterScreen`.
- Modify `src/app/_layout.tsx`
  - Make system status bar translucent for full-screen map.
- Remove or stop referencing:
  - `src/components/MainPager.tsx`
  - `src/components/MainPager.native.tsx`
  - `src/screens/MapScreen.tsx`
  - `src/screens/HistoryScreen.tsx`
  - `src/components/LiveStatusBar.tsx`
  - old full-width `src/components/TopBar.tsx` after replacing imports

---

### Task 1: Add Tested Center State Helpers

**Files:**
- Create: `src/screens/center/centerState.ts`
- Create: `src/screens/center/centerState.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/screens/center/centerState.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { HistorySession } from '@/store/historyStore'

import {
  canShowBaseOverlays,
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from './centerState'

const sessions = [
  session('newest', 3000),
  session('middle', 2000),
  session('oldest', 1000),
]

function session(id: string, startAtMs: number): HistorySession {
  return {
    id,
    deviceId: 'dev-1',
    deviceName: 'ADV',
    startAtMs,
    endAtMs: startAtMs + 60_000,
    blockIds: [id],
    distanceM: 1200,
    maxSpeedKmh: 32,
    sampleCount: 20,
    gpsPointCount: 20,
    faultCount: 0,
  }
}

describe('centerState', () => {
  test('getLatestSession returns first session from store order', () => {
    expect(getLatestSession(sessions)?.id).toBe('newest')
    expect(getLatestSession([])).toBeNull()
  })

  test('getPreviousRideSession moves toward older sessions', () => {
    expect(getPreviousRideSession(sessions, sessions[0])?.id).toBe('middle')
    expect(getPreviousRideSession(sessions, sessions[1])?.id).toBe('oldest')
    expect(getPreviousRideSession(sessions, sessions[2])).toBeNull()
  })

  test('getNextRideSession moves toward newer sessions', () => {
    expect(getNextRideSession(sessions, sessions[2])?.id).toBe('middle')
    expect(getNextRideSession(sessions, sessions[1])?.id).toBe('newest')
    expect(getNextRideSession(sessions, sessions[0])).toBeNull()
  })

  test('base overlays show only when not map focused and not reviewing ride', () => {
    expect(canShowBaseOverlays({ mapFocused: false, hasRide: false })).toBe(true)
    expect(canShowBaseOverlays({ mapFocused: true, hasRide: false })).toBe(false)
    expect(canShowBaseOverlays({ mapFocused: false, hasRide: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/screens/center/centerState.test.ts
```

Expected: FAIL because `src/screens/center/centerState.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create `src/screens/center/centerState.ts`:

```ts
import type { HistorySession } from '@/store/historyStore'

export interface BaseOverlayState {
  mapFocused: boolean
  hasRide: boolean
}

export function getLatestSession(sessions: HistorySession[]): HistorySession | null {
  return sessions[0] ?? null
}

export function getPreviousRideSession(
  sessions: HistorySession[],
  selected: HistorySession | null,
): HistorySession | null {
  if (!selected) return null
  const index = sessions.findIndex((session) => session.id === selected.id)
  if (index < 0) return null
  return sessions[index + 1] ?? null
}

export function getNextRideSession(
  sessions: HistorySession[],
  selected: HistorySession | null,
): HistorySession | null {
  if (!selected) return null
  const index = sessions.findIndex((session) => session.id === selected.id)
  if (index <= 0) return null
  return sessions[index - 1] ?? null
}

export function canShowBaseOverlays({ mapFocused, hasRide }: BaseOverlayState): boolean {
  return !mapFocused && !hasRide
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
bun test src/screens/center/centerState.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/center/centerState.ts src/screens/center/centerState.test.ts
git commit -m "Add center screen state helpers"
```

---

### Task 2: Build Single Center Map Component

**Files:**
- Create: `src/screens/center/CenterMap.tsx`
- Modify: `src/screens/CenterScreen.tsx`

- [ ] **Step 1: Extract map component from current live map**

Create `src/screens/center/CenterMap.tsx` with this public surface:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Mapbox, {
  Camera,
  FillLayer,
  FillExtrusionLayer,
  LineLayer,
  RasterLayer,
  RasterSource,
  ShapeSource,
  type Camera as CameraRef,
} from '@rnmapbox/maps'
import type { Feature, LineString } from 'geojson'
import type { LocationEvent } from 'vesc-ble'

import { MapPin } from '@/components/map/MapPin'
import { MAPBOX_ACCESS_TOKEN, MAPY_TILE_URL_TEMPLATE } from '@/config/mapy'
import { ONE_DARK_MAP_STYLE } from '@/constants/oneDarkMapStyle'
import { BLANK_STYLE, MAP_DEFAULTS, MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'
import { getBounds, makeCircleFeature, makeTrailLineString, zoomLevelForDelta } from '@/helpers/mapGeometry'
import type { HistoryGpsSample, HistoryMarker } from '@/store/historyStore'

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN)

export interface CenterMapHandle {
  recenterLive: () => void
  fitRide: () => void
  resetRotation: () => void
  togglePerspective: () => void
}

interface CenterMapProps {
  liveLocations: LocationEvent[]
  rideGpsSamples: HistoryGpsSample[]
  rideMarkers: HistoryMarker[]
  rideActive: boolean
  mapStyleKey: MapStyleKey
  rotationLocked: boolean
  perspectiveEnabled: boolean
  onPerspectiveChange: (enabled: boolean) => void
  onHeadingChange: (heading: number) => void
  onMapFocus: () => void
  onLongPressTarget: (target: { latitude: number; longitude: number }) => void
  targetLocation: { latitude: number; longitude: number } | null
  onClearTarget: () => void
}

export const CenterMap = forwardRef<CenterMapHandle, CenterMapProps>(function CenterMap(
  {
    liveLocations,
    rideGpsSamples,
    rideMarkers,
    rideActive,
    mapStyleKey,
    rotationLocked,
    perspectiveEnabled,
    onPerspectiveChange,
    onHeadingChange,
    onMapFocus,
    onLongPressTarget,
    targetLocation,
    onClearTarget,
  },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null)
  const lastCenteredAtRef = useRef<number | null>(null)
  const [followGps, setFollowGps] = useState(true)
  const gpsFix = liveLocations.at(-1) ?? null
  const selectedMapStyle = MAP_STYLES.find((style) => style.key === mapStyleKey) ?? MAP_STYLES[0]
  const isMapy = selectedMapStyle.key === 'mapy'
  const isOneDark = selectedMapStyle.key === 'onedark'
  const useCustomJSON = isMapy || isOneDark
  const showBuildings3d = selectedMapStyle.key === 'outdoors' || selectedMapStyle.key === 'onedark'

  const gpsCamera = useMemo(() => {
    if (!gpsFix) {
      return { centerCoordinate: MAP_DEFAULTS.fallbackCoordinate, zoomLevel: MAP_DEFAULTS.fallbackZoom }
    }
    const baseDelta =
      gpsFix.accuracyM != null
        ? Math.max(MAP_DEFAULTS.zoomDeltaMinAccuracy, gpsFix.accuracyM / 111_000)
        : MAP_DEFAULTS.zoomDeltaFallback
    return {
      centerCoordinate: [gpsFix.longitude, gpsFix.latitude] as [number, number],
      zoomLevel: zoomLevelForDelta(baseDelta * MAP_DEFAULTS.zoomDeltaMultiplier),
    }
  }, [gpsFix])

  const accuracyShape = useMemo(
    () =>
      gpsFix?.accuracyM != null
        ? makeCircleFeature(gpsFix.longitude, gpsFix.latitude, gpsFix.accuracyM)
        : null,
    [gpsFix],
  )
  const liveTrailShape = useMemo(
    () => (liveLocations.length >= 2 ? makeTrailLineString(liveLocations) : null),
    [liveLocations],
  )
  const rideRoute = useMemo(
    () => rideGpsSamples.map((point) => [point.longitude, point.latitude] as [number, number]),
    [rideGpsSamples],
  )
  const rideRouteShape = useMemo<Feature<LineString> | null>(
    () =>
      rideRoute.length > 1
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: rideRoute }, properties: {} }
        : null,
    [rideRoute],
  )

  const recenterLive = () => {
    setFollowGps(true)
    if (!gpsFix) return
    lastCenteredAtRef.current = gpsFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      animationDuration: MAP_DEFAULTS.animationDuration,
      animationMode: 'easeTo',
    })
  }

  const fitRide = () => {
    if (rideRoute.length < 2) return
    const bounds = getBounds(rideRoute)
    cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [90, 40, 120, 40], 700)
  }

  useImperativeHandle(
    ref,
    () => ({
      recenterLive,
      fitRide,
      resetRotation() {
        cameraRef.current?.setCamera({ heading: 0, animationDuration: MAP_DEFAULTS.animationDuration, animationMode: 'easeTo' })
        onHeadingChange(0)
      },
      togglePerspective() {
        const enabled = !perspectiveEnabled
        onPerspectiveChange(enabled)
        cameraRef.current?.setCamera({
          pitch: enabled ? MAP_DEFAULTS.activePitch : 0,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
    }),
    [fitRide, gpsCamera, gpsFix, onHeadingChange, onPerspectiveChange, perspectiveEnabled, recenterLive, rideRoute],
  )

  useEffect(() => {
    if (!gpsFix || !followGps || rideActive) return
    if (lastCenteredAtRef.current === gpsFix.timestamp) return
    lastCenteredAtRef.current = gpsFix.timestamp
    cameraRef.current?.setCamera({
      ...gpsCamera,
      animationDuration: MAP_DEFAULTS.followAnimationDuration,
      animationMode: 'easeTo',
    })
  }, [followGps, gpsCamera, gpsFix, rideActive])

  useEffect(() => {
    if (rideActive) requestAnimationFrame(fitRide)
  }, [fitRide, rideActive])

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Map unavailable</Text>
        <Text style={styles.emptyText}>Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and rebuild the app.</Text>
      </View>
    )
  }

  return (
    <Mapbox.MapView
      style={styles.map}
      styleURL={useCustomJSON ? undefined : selectedMapStyle.styleURL}
      styleJSON={isOneDark ? ONE_DARK_MAP_STYLE : isMapy ? BLANK_STYLE : undefined}
      pitchEnabled
      rotateEnabled={!rotationLocked}
      compassEnabled={false}
      scaleBarEnabled={false}
      logoEnabled={false}
      attributionEnabled={false}
      onLongPress={(feature) => {
        const [longitude, latitude] = feature.geometry.coordinates
        onLongPressTarget({ latitude, longitude })
      }}
      onCameraChanged={(state) => {
        if (state.gestures.isGestureActive) {
          setFollowGps(false)
          onMapFocus()
        }
        onHeadingChange(state.properties.heading)
        onPerspectiveChange(state.properties.pitch > MAP_DEFAULTS.pitchThreshold)
      }}
    >
      <Camera
        ref={cameraRef}
        defaultSettings={{ ...gpsCamera, pitch: MAP_DEFAULTS.defaultPitch }}
        maxZoomLevel={MAP_DEFAULTS.maxZoom}
        animationMode="easeTo"
      />

      {showBuildings3d && (
        <FillExtrusionLayer
          id="center-3d-buildings"
          sourceLayerID="building"
          minZoomLevel={14}
          maxZoomLevel={22}
          style={{
            fillExtrusionColor: isOneDark ? '#3e4451' : '#e5e7eb',
            fillExtrusionHeight: ['coalesce', ['get', 'height'], 12],
            fillExtrusionBase: ['coalesce', ['get', 'min_height'], 0],
            fillExtrusionOpacity: isOneDark ? 0.65 : 0.42,
            fillExtrusionVerticalGradient: true,
          }}
        />
      )}

      {isMapy ? (
        <RasterSource id="center-mapy-tiles" tileUrlTemplates={[MAPY_TILE_URL_TEMPLATE]} tileSize={256} maxZoomLevel={MAP_DEFAULTS.maxZoom}>
          <RasterLayer id="center-mapy-tiles-layer" sourceID="center-mapy-tiles" style={{}} />
        </RasterSource>
      ) : null}

      {!rideActive && liveTrailShape && (
        <ShapeSource id="center-live-trail-source" shape={liveTrailShape} lineMetrics>
          <LineLayer
            id="center-live-trail-line"
            style={{
              lineColor: MAP_DEFAULTS.trailColor,
              lineWidth: MAP_DEFAULTS.trailWidth,
              lineCap: 'round',
              lineJoin: 'round',
              lineGradient: ['interpolate', ['linear'], ['line-progress'], 0, MAP_DEFAULTS.trailGradientStart, 1, MAP_DEFAULTS.trailGradientEnd],
            }}
          />
        </ShapeSource>
      )}

      {rideActive && rideRouteShape && (
        <ShapeSource id="center-ride-route-source" shape={rideRouteShape}>
          <LineLayer id="center-ride-route-line" style={{ lineColor: theme.target.color, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>
      )}

      {!rideActive && gpsFix && (
        <>
          {accuracyShape && (
            <ShapeSource id="center-gps-accuracy-source" shape={accuracyShape}>
              <FillLayer id="center-gps-accuracy-fill" style={{ fillColor: MAP_DEFAULTS.accuracyFillColor }} />
            </ShapeSource>
          )}
          <MapPin id="center-gps-position" coordinate={[gpsFix.longitude, gpsFix.latitude]} color={MAP_DEFAULTS.markerColor} />
        </>
      )}

      {rideActive && rideRoute[0] && <MapPin id="center-ride-start" coordinate={rideRoute[0]} color="#22c55e" />}
      {rideActive && rideRoute.at(-1) && <MapPin id="center-ride-end" coordinate={rideRoute.at(-1)!} color={theme.error.color} />}
      {rideActive &&
        rideMarkers.map((marker) => {
          const gps = rideGpsSamples.find((point) => Math.abs(point.capturedAtMs - marker.occurredAtMs) < 5_000)
          if (!gps) return null
          return (
            <MapPin
              key={marker.id}
              id={`center-ride-marker-${marker.id}`}
              coordinate={[gps.longitude, gps.latitude]}
              color={marker.type === 'error' ? theme.error.color : '#f59e0b'}
            />
          )
        })}

      {targetLocation && !rideActive && (
        <MapPin id="center-target-position" coordinate={[targetLocation.longitude, targetLocation.latitude]} color={theme.target.color} onSelected={onClearTarget} />
      )}
    </Mapbox.MapView>
  )
})

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
  emptyContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#9ca3af', fontSize: 13, textAlign: 'center', lineHeight: 19 },
})
```

- [ ] **Step 2: Wire temporary map in `CenterScreen`**

Replace the connected-board return branch in `src/screens/CenterScreen.tsx` with a minimal shell that renders `CenterMap`. Keep current empty/no-board states unchanged.

Use this import set:

```tsx
import { useRef, useState } from 'react'
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import { FloatingBar } from '@/components/FloatingBar'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { type MapStyleKey } from '@/constants/mapStyles'
```

Add state inside `CenterScreen`:

```tsx
const mapRef = useRef<CenterMapHandle>(null)
const [mapStyleKey] = useState<MapStyleKey>('onedark')
const [heading, setHeading] = useState(0)
const [rotationLocked] = useState(false)
const [perspectiveEnabled, setPerspectiveEnabled] = useState(true)
const liveLocations = useBleStore((s) => s.liveLocationHistory)
const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore(
  useShallow((s) => ({
    targetLocation: s.targetLocation,
    setTargetLocation: s.setTargetLocation,
    clearTargetLocation: s.clearTargetLocation,
  })),
)
void heading
```

Use this connected return:

```tsx
return (
  <View style={styles.container}>
    <CenterMap
      ref={mapRef}
      liveLocations={liveLocations}
      rideGpsSamples={[]}
      rideMarkers={[]}
      rideActive={false}
      mapStyleKey={mapStyleKey}
      rotationLocked={rotationLocked}
      perspectiveEnabled={perspectiveEnabled}
      onPerspectiveChange={setPerspectiveEnabled}
      onHeadingChange={setHeading}
      onMapFocus={() => undefined}
      onLongPressTarget={setTargetLocation}
      targetLocation={targetLocation}
      onClearTarget={clearTargetLocation}
    />
    <FloatingBar
      bleStatus={bleStatus}
      activeBoard={activeBoard}
      onStopScan={onStopScan}
      onRetryConnect={onRetryConnect}
    />
  </View>
)
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS. If TypeScript reports missing `geojson` types, remove explicit `Feature`/`LineString` imports and let the shape object infer from the existing `MapScreen` pattern.

- [ ] **Step 4: Commit**

```bash
git add src/screens/center/CenterMap.tsx src/screens/CenterScreen.tsx
git commit -m "Add shared center map"
```

---

### Task 3: Collapse Main Screen To One Center Screen

**Files:**
- Modify: `src/app/index.tsx`
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Rewrite `src/app/index.tsx` to remove pager/tabs**

Replace `src/app/index.tsx` with the existing lifecycle/autoconnect logic plus a single `CenterScreen`. Keep the existing `BackHandler` double-exit logic for now; ride/map-focus back handling is added later.

Use this render:

```tsx
return (
  <View style={styles.container}>
    <CenterScreen
      activeBoard={connection.activeBoard}
      boardsLoaded={boardsLoaded}
      bleStatus={connection.bleStatus}
      onStopScan={connection.handleCancel}
      onRetryConnect={connection.handleRetryConnect}
      boards={connection.boards}
      activeBoardId={connection.activeBoardId}
      recordDebugSession={connection.recordDebugSession}
      onSelectBoard={connection.handleSelectBoard}
      onAddBoard={connection.handleAddBoard}
      onToggleRecordDebug={() => connection.setRecordDebugSession(!connection.recordDebugSession)}
    />
  </View>
)
```

Update `CenterScreenProps` in `src/screens/CenterScreen.tsx` to accept the added top-bar props:

```ts
import type { Board } from '@/store/boardStore'

interface CenterScreenProps {
  activeBoard: Board | undefined
  activeBoardId: string | null
  boards: Board[]
  boardsLoaded: boolean
  bleStatus: string
  recordDebugSession: boolean
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
}
```

- [ ] **Step 2: Make status bar transparent**

In `src/app/_layout.tsx`, replace:

```tsx
<StatusBar style="light" />
```

with:

```tsx
<StatusBar style="light" translucent backgroundColor="transparent" />
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/index.tsx src/app/_layout.tsx src/screens/CenterScreen.tsx
git commit -m "Render center map as main screen"
```

---

### Task 4: Add Compact Floating Top Bar

**Files:**
- Create: `src/screens/center/TopBar.tsx`
- Modify: `src/screens/CenterScreen.tsx`

- [ ] **Step 1: Create floating top bar**

Create `src/screens/center/TopBar.tsx`:

```tsx
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CaretDownIcon, PencilSimpleIcon, PlugsConnectedIcon, PlugsIcon, XCircleIcon } from 'phosphor-react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BoardSelectorSheet } from '@/components/BoardSelectorSheet'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { theme } from '@/constants/theme'

interface TopBarProps {
  visible: boolean
  boards: Board[]
  activeBoardId: string | null
  activeBoard: Board | undefined
  bleStatus: string
  recordDebugSession: boolean
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
  onDisconnect: () => void
  onRetryConnect: () => void
}

export function TopBar({
  visible,
  boards,
  activeBoardId,
  activeBoard,
  bleStatus,
  recordDebugSession,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
  onDisconnect,
  onRetryConnect,
}: TopBarProps) {
  const insets = useSafeAreaInsets()
  const [selectorOpen, setSelectorOpen] = useState(false)
  if (!visible) return null

  const canDisconnect =
    bleStatus === 'connected' ||
    bleStatus === 'stale' ||
    bleStatus === 'reconnecting' ||
    bleStatus === 'waiting_for_telemetry'
  const canRetry = bleStatus === 'idle' || bleStatus === 'error'
  const name = activeBoard?.name ?? 'No board'
  const statusColor = bleStatus === 'connected' ? theme.success.color : bleStatus === 'error' ? theme.error.color : '#94a3b8'

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <Pressable style={styles.boardButton} onPress={() => setSelectorOpen(true)}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.boardText} numberOfLines={1}>
            {name}
          </Text>
          <CaretDownIcon size={12} color="#cbd5e1" weight="bold" />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.iconButton}
          disabled={!activeBoard}
          onPress={() => {
            if (!activeBoard) return
            router.push({ pathname: routes.addBoardDetails, params: { boardId: activeBoard.id } })
          }}
        >
          <PencilSimpleIcon size={15} color={activeBoard ? '#e2e8f0' : '#64748b'} weight="bold" />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.iconButton} onPress={canDisconnect ? onDisconnect : onRetryConnect}>
          {canDisconnect ? (
            <PlugsConnectedIcon size={16} color="#fca5a5" weight="bold" />
          ) : canRetry ? (
            <PlugsIcon size={16} color="#facc15" weight="bold" />
          ) : (
            <XCircleIcon size={16} color="#94a3b8" weight="bold" />
          )}
        </Pressable>
      </View>

      <BoardSelectorSheet
        visible={selectorOpen}
        boards={boards}
        activeBoardId={activeBoardId}
        recordDebugSession={recordDebugSession}
        onClose={() => setSelectorOpen(false)}
        onSelectBoard={(id) => {
          onSelectBoard(id)
          setSelectorOpen(false)
        }}
        onAddBoard={() => {
          setSelectorOpen(false)
          onAddBoard()
        }}
        onToggleRecordDebug={onToggleRecordDebug}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 12,
    zIndex: 20,
  },
  pill: {
    minHeight: 36,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    overflow: 'hidden',
  },
  boardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 8,
    minHeight: 36,
    maxWidth: 132,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  boardText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    maxWidth: 92,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  iconButton: {
    width: 34,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

- [ ] **Step 2: Render top bar from `CenterScreen`**

In `src/screens/CenterScreen.tsx`, import:

```tsx
import { TopBar } from '@/screens/center/TopBar'
```

Render above `FloatingBar`:

```tsx
<TopBar
  visible
  boards={boards}
  activeBoardId={activeBoardId}
  activeBoard={activeBoard}
  bleStatus={bleStatus}
  recordDebugSession={recordDebugSession}
  onSelectBoard={onSelectBoard}
  onAddBoard={onAddBoard}
  onToggleRecordDebug={onToggleRecordDebug}
  onDisconnect={onStopScan}
  onRetryConnect={onRetryConnect}
/>
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS. If icon export names differ, inspect `node_modules/phosphor-react-native/dist/index.d.ts` and use only `Icon`-suffixed exports.

- [ ] **Step 4: Commit**

```bash
git add src/screens/center/TopBar.tsx src/screens/CenterScreen.tsx
git commit -m "Add floating board top bar"
```

---

### Task 5: Add Live HUD And Bottom Telemetry Strip

**Files:**
- Create: `src/screens/center/LiveHud.tsx`
- Create: `src/screens/center/BottomTelemetryStrip.tsx`
- Modify: `src/screens/CenterScreen.tsx`

- [ ] **Step 1: Create `LiveHud`**

Create `src/screens/center/LiveHud.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedProps } from 'react-native-reanimated'

import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const AnimatedText = Animated.createAnimatedComponent(Text)

interface LiveHudProps {
  visible: boolean
}

export function LiveHud({ visible }: LiveHudProps) {
  const insets = useSafeAreaInsets()
  if (!visible) return null

  const speedProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.speedKmh.value, telemetry.speed.formatWithUnit),
  }))
  const dutyProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.dutyPercent.value, telemetry.duty.formatWithUnit),
  }))
  const batteryProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.batteryVoltage.value, telemetry.battVoltage.formatWithUnit),
  }))
  const motorTempProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.motorTemp.value, telemetry.motorTemp.formatWithUnit),
  }))
  const controllerTempProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.controllerTemp.value, telemetry.controllerTemp.formatWithUnit),
  }))

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.topCluster, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable style={[styles.metric, styles.metricLarge]} onPress={() => router.push(routes.controlSpeed)}>
          <Text style={styles.label}>Speed</Text>
          <AnimatedText animatedProps={speedProps} style={styles.valueLarge} />
        </Pressable>
        <Pressable style={[styles.metric, styles.metricBattery]} onPress={() => router.push(routes.controlBattery)}>
          <Text style={styles.label}>Battery</Text>
          <AnimatedText animatedProps={batteryProps} style={styles.valueSmall} />
        </Pressable>
        <Pressable style={[styles.metric, styles.metricLarge]} onPress={() => router.push(routes.controlDuty)}>
          <Text style={styles.label}>Duty</Text>
          <AnimatedText animatedProps={dutyProps} style={styles.valueLarge} />
        </Pressable>
      </View>

      <Pressable style={styles.tempCluster} onPress={() => router.push(routes.controlTemperatures)}>
        <View style={styles.tempBox}>
          <Text style={styles.label}>Motor</Text>
          <AnimatedText animatedProps={motorTempProps} style={styles.valueSmall} />
        </View>
        <View style={styles.tempBox}>
          <Text style={styles.label}>Ctrl</Text>
          <AnimatedText animatedProps={controllerTempProps} style={styles.valueSmall} />
        </View>
      </Pressable>
    </View>
  )
}

function formatShared(value: number | null, format: (value: number) => string): string {
  return value == null || !Number.isFinite(value) ? '-' : format(value)
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  topCluster: {
    position: 'absolute',
    top: 0,
    left: 86,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 8,
  },
  metric: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    alignItems: 'center',
  },
  metricLarge: { minWidth: 78 },
  metricBattery: { minWidth: 70, marginTop: 2 },
  label: {
    color: 'rgba(203, 213, 225, 0.82)',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  valueLarge: {
    color: '#f8fafc',
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  valueSmall: {
    color: '#f8fafc',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  tempCluster: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 76,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  tempBox: {
    minWidth: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: 'rgba(15, 23, 42, 0.44)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
  },
})
```

- [ ] **Step 2: Create `BottomTelemetryStrip`**

Create `src/screens/center/BottomTelemetryStrip.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import Animated, { useAnimatedProps } from 'react-native-reanimated'

import { telemetry } from '@/constants/telemetry'
import { routes } from '@/navigation/routes'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const AnimatedText = Animated.createAnimatedComponent(Text)

interface BottomTelemetryStripProps {
  visible: boolean
}

export function BottomTelemetryStrip({ visible }: BottomTelemetryStripProps) {
  if (!visible) return null

  const motorCurrentProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.motorCurrent.value, telemetry.motorCurrent.formatWithUnit),
  }))
  const batteryCurrentProps = useAnimatedProps(() => ({
    text: formatShared(liveTelemetryRuntime.values.batteryCurrent.value, telemetry.battCurrent.formatWithUnit),
  }))

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.strip}>
        <Pressable style={styles.cell} onPress={() => router.push(routes.controlCurrents)}>
          <Text style={styles.label}>Motor A</Text>
          <AnimatedText animatedProps={motorCurrentProps} style={styles.value} />
        </Pressable>
        <Pressable style={styles.cell} onPress={() => router.push(routes.controlCurrents)}>
          <Text style={styles.label}>Batt A</Text>
          <AnimatedText animatedProps={batteryCurrentProps} style={styles.value} />
        </Pressable>
        <Pressable style={styles.cell} onPress={() => router.push(routes.controlFootpad)}>
          <Text style={styles.label}>Footpad</Text>
          <View style={styles.footpadRow}>
            <View style={styles.footpadDot} />
            <View style={styles.footpadDot} />
          </View>
        </Pressable>
        <Pressable style={styles.cell} onPress={() => router.push(routes.controlImu)}>
          <Text style={styles.label}>IMU</Text>
          <View style={styles.imuIcon}>
            <View style={styles.imuBoard} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

function formatShared(value: number | null, format: (value: number) => string): string {
  return value == null || !Number.isFinite(value) ? '-' : format(value)
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 12,
    zIndex: 10,
  },
  strip: {
    minHeight: 52,
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    overflow: 'hidden',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 3,
  },
  label: {
    color: 'rgba(203, 213, 225, 0.78)',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  value: {
    color: '#f8fafc',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '800',
  },
  footpadRow: {
    flexDirection: 'row',
    gap: 5,
  },
  footpadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: 'rgba(100, 116, 139, 0.22)',
  },
  imuIcon: {
    width: 30,
    height: 14,
    justifyContent: 'center',
  },
  imuBoard: {
    width: 30,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#a78bfa',
    transform: [{ rotate: '-8deg' }],
  },
})
```

- [ ] **Step 3: Render both overlays**

In `src/screens/CenterScreen.tsx`, import:

```tsx
import { LiveHud } from '@/screens/center/LiveHud'
import { BottomTelemetryStrip } from '@/screens/center/BottomTelemetryStrip'
```

Render with base visibility:

```tsx
<LiveHud visible />
<BottomTelemetryStrip visible />
```

Place them after `CenterMap` and before `TopBar`.

- [ ] **Step 4: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS. If animated text typing fails, use the fallback in Task 10 Step 2 and read values through `metricVersion`.

- [ ] **Step 5: Commit**

```bash
git add src/screens/center/LiveHud.tsx src/screens/center/BottomTelemetryStrip.tsx src/screens/CenterScreen.tsx
git commit -m "Add live map telemetry overlays"
```

---

### Task 6: Add Map Focus Controls

**Files:**
- Modify: `src/screens/CenterScreen.tsx`

- [ ] **Step 1: Add focus state and controls**

In `src/screens/CenterScreen.tsx`, import:

```tsx
import { ArrowLeftIcon } from 'phosphor-react-native'
import { MapControls } from '@/components/map/MapControls'
import { MapStyleSwitch } from '@/components/map/MapStyleSwitch'
import { canShowBaseOverlays } from '@/screens/center/centerState'
```

Add state:

```tsx
const [mapFocused, setMapFocused] = useState(false)
const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>('onedark')
const [rotationLocked, setRotationLocked] = useState(false)
```

Remove the earlier constant versions of those values.

Add handlers:

```tsx
const showBaseOverlays = canShowBaseOverlays({ mapFocused, hasRide: false })

const exitMapFocus = () => {
  setMapFocused(false)
  mapRef.current?.recenterLive()
}
```

Update `CenterMap`:

```tsx
onMapFocus={() => setMapFocused(true)}
```

Update overlay visibility:

```tsx
<LiveHud visible={showBaseOverlays} />
<BottomTelemetryStrip visible={showBaseOverlays} />
<TopBar
  visible={showBaseOverlays}
  boards={boards}
  activeBoardId={activeBoardId}
  activeBoard={activeBoard}
  bleStatus={bleStatus}
  recordDebugSession={recordDebugSession}
  onSelectBoard={onSelectBoard}
  onAddBoard={onAddBoard}
  onToggleRecordDebug={onToggleRecordDebug}
  onDisconnect={onStopScan}
  onRetryConnect={onRetryConnect}
/>
```

Render map focus controls:

```tsx
{mapFocused && (
  <>
    <Pressable style={styles.backButton} onPress={exitMapFocus}>
      <ArrowLeftIcon size={20} color="#f8fafc" weight="bold" />
    </Pressable>
    <MapControls
      heading={heading}
      rotationLocked={rotationLocked}
      perspectiveEnabled={perspectiveEnabled}
      followGps={false}
      showClearTarget={!!targetLocation}
      onResetRotation={() => mapRef.current?.resetRotation()}
      onToggleRotationLock={() => setRotationLocked((prev) => !prev)}
      onTogglePerspective={() => mapRef.current?.togglePerspective()}
      onRecenter={exitMapFocus}
      onClearTarget={clearTargetLocation}
    />
    <MapStyleSwitch activeKey={mapStyleKey} onSelect={setMapStyleKey} />
  </>
)}
```

Add style:

```tsx
backButton: {
  position: 'absolute',
  top: 44,
  left: 12,
  zIndex: 30,
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.28)',
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
},
```

- [ ] **Step 2: Run tests and TypeScript**

Run:

```bash
bun test src/screens/center/centerState.test.ts
bun run ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/CenterScreen.tsx src/screens/center/centerState.ts src/screens/center/centerState.test.ts
git commit -m "Add map focus controls"
```

---

### Task 7: Add Ride Review Controls And History Integration

**Files:**
- Create: `src/screens/center/HistoryControls.tsx`
- Modify: `src/screens/CenterScreen.tsx`

- [ ] **Step 1: Create `HistoryControls`**

Create `src/screens/center/HistoryControls.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ArrowLeftIcon, CaretLeftIcon, CaretRightIcon, ListBulletsIcon } from 'phosphor-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface HistoryControlsProps {
  title: string
  canPrevious: boolean
  canNext: boolean
  loading: boolean
  onBack: () => void
  onPrevious: () => void
  onNext: () => void
  onOpenList: () => void
}

export function HistoryControls({
  title,
  canPrevious,
  canNext,
  loading,
  onBack,
  onPrevious,
  onNext,
  onOpenList,
}: HistoryControlsProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <Pressable style={styles.iconButton} onPress={onBack}>
          <ArrowLeftIcon size={19} color="#f8fafc" weight="bold" />
        </Pressable>
        <Pressable style={[styles.iconButton, !canPrevious && styles.disabled]} disabled={!canPrevious || loading} onPress={onPrevious}>
          <CaretLeftIcon size={18} color="#f8fafc" weight="bold" />
        </Pressable>
        <Pressable style={styles.titleButton} onPress={onOpenList}>
          <ListBulletsIcon size={15} color="#cbd5e1" weight="bold" />
          <Text style={styles.title} numberOfLines={1}>
            {loading ? 'Loading ride...' : title}
          </Text>
        </Pressable>
        <Pressable style={[styles.iconButton, !canNext && styles.disabled]} disabled={!canNext || loading} onPress={onNext}>
          <CaretRightIcon size={18} color="#f8fafc" weight="bold" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    zIndex: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  disabled: {
    opacity: 0.35,
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
})
```

- [ ] **Step 2: Integrate history store in `CenterScreen`**

Import:

```tsx
import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { HistorySessionSheet } from '@/components/history/HistorySessionSheet'
import { HistoryControls } from '@/screens/center/HistoryControls'
import { useHistoryStore } from '@/store/historyStore'
import {
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from '@/screens/center/centerState'
```

Add selected history state:

```tsx
const [historySheetVisible, setHistorySheetVisible] = useState(false)
const [historyLoadedOnce, setHistoryLoadedOnce] = useState(false)
const {
  sessions,
  selectedSession,
  sessionGpsSamples,
  sessionMarkers,
  loadingSession,
  loading,
  error: historyError,
  loadInitial,
  selectSession,
} = useHistoryStore(
  useShallow((s) => ({
    sessions: s.sessions,
    selectedSession: s.selectedSession,
    sessionGpsSamples: s.sessionGpsSamples,
    sessionMarkers: s.sessionMarkers,
    loadingSession: s.loadingSession,
    loading: s.loading,
    error: s.error,
    loadInitial: s.loadInitial,
    selectSession: s.selectSession,
  })),
)
const rideActive = !!selectedSession
const previousRide = getPreviousRideSession(sessions, selectedSession)
const nextRide = getNextRideSession(sessions, selectedSession)
const showBaseOverlays = canShowBaseOverlays({ mapFocused, hasRide: rideActive })
```

Add handlers:

```tsx
const enterRideReview = async () => {
  setMapFocused(false)
  if (!historyLoadedOnce) {
    await loadInitial()
    setHistoryLoadedOnce(true)
  }
  const latest = getLatestSession(useHistoryStore.getState().sessions)
  if (latest) {
    await selectSession(latest)
  }
}

const exitRideReview = () => {
  void selectSession(null)
  setMapFocused(false)
  requestAnimationFrame(() => mapRef.current?.recenterLive())
}

const selectRide = (session: NonNullable<typeof selectedSession>) => {
  setHistorySheetVisible(false)
  void selectSession(session)
}
```

Pass ride data to `CenterMap`:

```tsx
rideGpsSamples={sessionGpsSamples}
rideMarkers={sessionMarkers}
rideActive={rideActive}
```

Render a history entry button in base overlays:

```tsx
{showBaseOverlays && (
  <Pressable style={styles.historyButton} onPress={() => void enterRideReview()}>
    <ClockCounterClockwiseIcon size={18} color="#f8fafc" weight="bold" />
  </Pressable>
)}
```

Render controls and sheet:

```tsx
{rideActive && (
  <HistoryControls
    title={selectedSession ? `${new Date(selectedSession.startAtMs).toLocaleString()} · ${selectedSession.deviceName}` : 'Ride'}
    canPrevious={!!previousRide}
    canNext={!!nextRide}
    loading={loadingSession || loading}
    onBack={exitRideReview}
    onPrevious={() => {
      if (previousRide) void selectSession(previousRide)
    }}
    onNext={() => {
      if (nextRide) void selectSession(nextRide)
    }}
    onOpenList={() => setHistorySheetVisible(true)}
  />
)}
<HistorySessionSheet
  visible={historySheetVisible}
  sessions={sessions}
  selectedSessionId={selectedSession?.id ?? null}
  onClose={() => setHistorySheetVisible(false)}
  onSelectSession={selectRide}
/>
{historyLoadedOnce && !loading && sessions.length === 0 && !selectedSession && (
  <View style={styles.historyEmpty}>
    <Text style={styles.historyEmptyTitle}>No rides yet</Text>
    <Text style={styles.historyEmptyText}>Recorded rides will show here.</Text>
  </View>
)}
{historyError ? (
  <View style={styles.historyError}>
    <Text style={styles.historyErrorText} selectable>{historyError}</Text>
  </View>
) : null}
```

Add `ClockCounterClockwiseIcon` import and styles:

```tsx
historyButton: {
  position: 'absolute',
  right: 12,
  bottom: 76,
  zIndex: 20,
  width: 42,
  height: 42,
  borderRadius: 21,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(148, 163, 184, 0.28)',
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
},
historyEmpty: {
  position: 'absolute',
  left: 24,
  right: 24,
  top: '45%',
  zIndex: 25,
  borderRadius: 12,
  padding: 14,
  backgroundColor: 'rgba(15, 23, 42, 0.78)',
  alignItems: 'center',
},
historyEmptyTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '800' },
historyEmptyText: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
historyError: {
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 76,
  zIndex: 25,
  borderRadius: 10,
  padding: 10,
  backgroundColor: 'rgba(69, 26, 26, 0.88)',
  borderWidth: 1,
  borderColor: '#7f1d1d',
},
historyErrorText: { color: '#fecaca', fontSize: 12, fontWeight: '700' },
```

- [ ] **Step 3: Run tests and TypeScript**

Run:

```bash
bun test src/screens/center/centerState.test.ts
bun run ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/center/HistoryControls.tsx src/screens/CenterScreen.tsx
git commit -m "Add ride review on center map"
```

---

### Task 8: Main Back Handling And Overlay Visibility

**Files:**
- Modify: `src/screens/CenterScreen.tsx`
- Modify: `src/app/index.tsx`

- [ ] **Step 1: Move main back priority into `CenterScreen`**

Add to `CenterScreen`:

```tsx
import { BackHandler, ToastAndroid } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
```

Add ref:

```tsx
const backPressedOnce = useRef(false)
```

Add focus effect:

```tsx
useFocusEffect(
  useCallback(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (rideActive) {
        exitRideReview()
        return true
      }
      if (mapFocused) {
        exitMapFocus()
        return true
      }
      if (backPressedOnce.current) {
        BackHandler.exitApp()
        return true
      }
      backPressedOnce.current = true
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT)
      setTimeout(() => {
        backPressedOnce.current = false
      }, 2000)
      return true
    })
    return () => handler.remove()
  }, [exitMapFocus, exitRideReview, mapFocused, rideActive]),
)
```

Wrap `exitMapFocus` and `exitRideReview` with `useCallback` so dependencies are stable.

- [ ] **Step 2: Remove old back handling from `src/app/index.tsx`**

Remove `BackHandler`, `ToastAndroid`, `useFocusEffect`, `pagerRef`, `backPressedOnce`, `page`, `setPage`, `TABS`, `MainPager`, `TopBar`, `LiveStatusBar`, `HistoryScreen`, and `MapScreen` imports/usages from `src/app/index.tsx`.

The file should only do app bootstrapping/autoconnect and render `CenterScreen`.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/CenterScreen.tsx src/app/index.tsx
git commit -m "Prioritize center screen back handling"
```

---

### Task 9: Remove Obsolete Screens And Status Components

**Files:**
- Delete: `src/components/MainPager.tsx`
- Delete: `src/components/MainPager.native.tsx`
- Delete: `src/screens/MapScreen.tsx`
- Delete: `src/screens/HistoryScreen.tsx`
- Delete: `src/components/LiveStatusBar.tsx`
- Delete or replace: `src/components/TopBar.tsx`

- [ ] **Step 1: Confirm no imports remain**

Run:

```bash
rg "MainPager|MapScreen|HistoryScreen|LiveStatusBar|@/components/TopBar|from '@/components/TopBar'" src
```

Expected: no output.

- [ ] **Step 2: Delete unused files**

Use `rm` only after Step 1 has no output:

```bash
rm src/components/MainPager.tsx src/components/MainPager.native.tsx src/screens/MapScreen.tsx src/screens/HistoryScreen.tsx src/components/LiveStatusBar.tsx src/components/TopBar.tsx
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
bun run ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/MainPager.tsx src/components/MainPager.native.tsx src/screens/MapScreen.tsx src/screens/HistoryScreen.tsx src/components/LiveStatusBar.tsx src/components/TopBar.tsx
git commit -m "Remove old tabbed main screens"
```

---

### Task 10: Polish, Verify, And Fix Compile Issues

**Files:**
- Modify: `src/screens/CenterScreen.tsx`
- Modify: `src/screens/center/CenterMap.tsx`
- Modify: `src/screens/center/TopBar.tsx`
- Modify: `src/screens/center/LiveHud.tsx`
- Modify: `src/screens/center/BottomTelemetryStrip.tsx`
- Modify: `src/screens/center/HistoryControls.tsx`

- [ ] **Step 1: Run full static checks**

Run:

```bash
bun run ts
bun run lint
bun test src/screens/center/centerState.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Apply `react-native-reanimated` animated text fallback when compiler rejects animated text props**

If `LiveHud` or `BottomTelemetryStrip` cannot set text through animated props, replace those components with store-version based text. Use this pattern:

```tsx
const metricVersion = useBleStore((s) => s.metricVersion)
const speed = useMemo(() => liveTelemetryRuntime.values.speedKmh.value, [metricVersion])
```

Then render:

```tsx
<Text style={styles.valueLarge}>
  {speed == null ? '-' : telemetry.speed.formatWithUnit(speed)}
</Text>
```

Apply same pattern for duty, battery voltage, temperatures, and currents.

- [ ] **Step 3: Replace unavailable Phosphor icon names when compiler reports missing exports**

If TypeScript reports an icon export does not exist, inspect exports:

```bash
rg "Pencil.*Icon|Plug.*Icon|ClockCounterClockwiseIcon" node_modules/phosphor-react-native -n | head
```

Replace with available `Icon`-suffixed exports only. Do not use emoji or Unicode substitutes.

- [ ] **Step 4: Manual runtime checks**

Run app:

```bash
bun run android
```

Manual expected behavior:

- no bottom tabs
- map extends behind system status bar
- compact board pill always visible in base live view
- speed and duty are prominent
- battery is compact near top center
- temperatures/current/footpad/IMU strip floats near bottom
- panning map hides base overlays and shows back/map controls
- map focus back recenters live GPS
- history button loads newest ride and fits route
- previous/next ride switch route without remounting map
- ride review back returns to live GPS
- metric taps open existing detail screens and system back returns to map

- [ ] **Step 5: Commit final fixes**

```bash
git add src package.json bun.lock
git commit -m "Polish map-first center screen"
```

If there are no changes after verification, skip this commit.

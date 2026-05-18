# Map-First Center Screen Design

## Goal

Replace the current three-tab main experience with one map-first screen. The map fills the full device screen, including the system status bar area. Live riding data stays readable over the map, with speed and duty cycle treated as more important than the map during a ride.

The screen must stay smooth: one Mapbox instance remains mounted, overlays appear and disappear around it, and ride review draws on the same map instead of navigating to a separate history map.

## Current State

`src/app/index.tsx` renders a pager with History, Board, and Map tabs. `CenterScreen` shows telemetry cards, `MapScreen` owns a live Mapbox instance, and `HistoryScreen` owns a separate `HistoryMapPlayer` with another Mapbox instance. `LiveStatusBar` adds a separate status row above the pager.

This split causes mode changes to feel like screen swaps and duplicates map work.

## Chosen Approach

Use a single `CenterScreen` shell with simple component names:

- `CenterScreen`: owns map camera, focus state, ride review state, and back handling.
- `CenterMap`: renders one `Mapbox.MapView` with live layers and optional ride review layers.
- `TopBar`: compact floating board pill.
- `LiveHud`: speed, duty, battery, and temperatures over the map.
- `BottomTelemetryStrip`: compact floating telemetry groups for temperatures, currents, footpad, and IMU.
- `HistoryControls`: ride review controls.
- Existing `MapControls`, `MapStyleSwitch`, and `HistorySessionSheet`: reused as overlays.

No draggable bottom shelf is included in this pass.

## Main Screen Layout

`src/app/index.tsx` renders only `CenterScreen`. Remove the bottom tab bar and `MainPager` from the main screen.

The map is absolute/full-screen behind all UI. It extends under the system status bar. Floating UI uses safe-area insets for touchable content, but the map itself is not clipped to safe area.

## Floating Top Bar

The top bar is a compact board pill, always visible during the base live riding view. It should not be full-width.

Content:

- active board name, for example `ADV`
- dropdown affordance using a Phosphor icon
- edit action using a Phosphor icon
- disconnect/cancel/retry action using Phosphor icons and BLE state

Visual target: `(ADV v | edit | disconnect)`, implemented with icons from `phosphor-react-native`, not emoji or Unicode substitutes.

The current `LiveStatusBar` is removed. Connection state moves into the board pill as a compact color/status treatment and remains visible in existing detail surfaces that already show connection context.

## Live HUD

Live HUD overlays the map in the base live riding view.

Priority:

1. Speed and duty cycle are largest and easiest to read.
2. Battery is smaller and near the top center.
3. Temperatures move lower, near the bottom telemetry strip.

Each major value is tappable and routes to the existing detail screen:

- speed: `routes.controlSpeed`
- duty: `routes.controlDuty`
- battery: `routes.controlBattery`
- temperatures: `routes.controlTemperatures`

The HUD uses transparent/dimmed backgrounds so the map remains visible, but readability wins over pure map visibility.

## Bottom Telemetry Strip

Instead of a bottom shelf, render a compact floating strip over the bottom of the map.

Content:

- temperatures with small sparklines
- motor and battery current numbers
- tiny footpad indicators that highlight when active
- simple IMU board icon showing tilt in one direction

Each group opens the existing detail route:

- currents: `routes.controlCurrents`
- footpad: `routes.controlFootpad`
- IMU: `routes.controlImu`

Reuse existing card, sparkline, gauge, and formatting logic unless doing so makes the strip too tall or expensive to render. The strip should be compact enough to keep map controls usable and speed/duty dominant.

## Map Focus

When the user pans, zooms, or rotates the map, enter map focus.

Map focus hides:

- `TopBar`
- `LiveHud`
- `BottomTelemetryStrip`

Map focus shows:

- back button
- `MapControls`
- `MapStyleSwitch`

Back exits map focus and recenters live GPS. It does not auto-return after a timeout.

## Ride Review

The history button enters ride review. This is not shown to the user as a separate mode; it is the same map looking at a past ride.

On first history tap:

- load history sessions on demand
- select the latest ride
- draw that ride route on the same map
- animate the camera to fit the route

Ride review controls:

- back: exits ride review and recenters live GPS
- previous ride
- next ride
- ride list/menu using `HistorySessionSheet`

No play/pause or timeline scrubber is included in this pass.

Ride review map layers:

- selected ride route line
- start and end points
- error/disconnect/app-stop markers

No moving playback pin is required.

Delete ride should not be a primary control. It can remain in the ride list or a secondary details/menu surface.

## Detail Navigation

Metric details remain existing full-screen routes. Opening a metric detail should preserve the main map state underneath when the user goes back.

Expected behavior:

- detail screen back returns to the map
- live/ride review state remains if the screen instance stays mounted
- main map back exits ride review first, then map focus, then uses the existing double-back-to-exit behavior

## Data Flow

Live data:

- `useBleStore.liveLocationHistory` feeds live trail and current GPS pin.
- current board telemetry feeds HUD and bottom strip.
- existing formatting helpers and telemetry constants remain source of truth.

Board data/actions:

- reuse existing board connection logic from `useBoardConnection`.
- top board pill opens existing board selection/edit actions.

History data:

- use `useHistoryStore`.
- `loadInitial` runs only when the user first enters ride review.
- `selectSession` loads selected ride samples/GPS/markers.
- session ordering remains the existing store order used by `HistoryMapPlayer`.

Map state:

- one camera ref controls live recenter, ride fit, rotation reset, and perspective toggle.
- live trail and ride review route are separate memoized GeoJSON shapes.

## Performance

Keep the Mapbox view mounted once.

Avoid rendering heavy history charts in this pass. Ride review only needs route and lightweight controls.

Memoize GeoJSON shapes and derived telemetry values.

Keep overlay animation simple:

- opacity/translate animations for HUD, top bar, strip, and controls
- no continuous JS-driven animation loops
- no draggable sheet in this pass

History is loaded on demand and not during normal live riding startup.

## Error and Empty States

If Mapbox token is missing, show the existing map unavailable message.

If history has no rides, tapping history shows a small overlay saying there are no rides yet. Ride review controls stay hidden except for back.

If selected ride has no GPS points, show ride metadata/controls and a small map overlay explaining that no route is available.

BLE disconnected states appear in the top board pill and detail surfaces. Live HUD can dim stale/unavailable telemetry instead of disappearing.

## Testing

Run:

- `bun run ts`
- `bun run lint`
- focused `bun test` for touched helpers/components if logic is extracted

Manual checks on device or emulator:

- main screen has no bottom tabs
- map fills under system status bar
- board pill is compact and always visible in base live view
- speed and duty are readable over the map
- map pan hides base overlays and shows back/map controls
- back from map focus recenters live GPS
- history button loads latest ride and fits route
- prev/next ride update route on same map
- ride review back returns to live GPS
- metric taps open existing detail routes and back returns to map

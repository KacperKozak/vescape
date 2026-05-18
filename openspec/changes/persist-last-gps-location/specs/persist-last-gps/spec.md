## ADDED Requirements

### Requirement: Persist last known location coordinate

The system SHALL persist the most recent native location coordinate (latitude and longitude) to durable storage whenever native location tracking is active.

#### Scenario: Native location fix is saved

- **WHEN** native location tracking emits a location fix
- **THEN** native code SHALL persist that coordinate to `AppSettings` without waiting for JS app state

#### Scenario: Repeated location fixes are throttled

- **WHEN** native location tracking emits multiple location fixes during an active session
- **THEN** native code SHALL persist at most once per 30 seconds

#### Scenario: No persist without location fix

- **WHEN** native location tracking has not emitted a location fix
- **THEN** the system SHALL NOT update the persisted coordinate

### Requirement: Map uses persisted coordinate as fallback on cold start

The system SHALL use the persisted location coordinate as the map's initial center when no live GPS fix is available.

#### Scenario: App launches with persisted coordinate and no GPS fix yet

- **WHEN** the map initializes and no live GPS fix exists
- **AND** a persisted coordinate exists in `AppSettings`
- **THEN** the map SHALL center on the persisted coordinate

#### Scenario: App launches with no persisted coordinate and no GPS fix

- **WHEN** the map initializes and no live GPS fix exists
- **AND** no persisted coordinate exists in `AppSettings`
- **THEN** the map SHALL show an Europe overview

#### Scenario: Live GPS fix takes precedence

- **WHEN** the map has a live GPS fix available
- **THEN** the map SHALL use the live GPS coordinate regardless of any persisted value

### Requirement: Map fades in after camera is positioned

The map SHALL remain invisible until the initial camera position is determined, then fade in smoothly. This prevents the user from seeing the Mapbox default `[0, 0]` (null island).

#### Scenario: Map hidden until settings loaded

- **WHEN** the map component mounts
- **AND** settings have not yet loaded
- **THEN** the map SHALL render with opacity 0

#### Scenario: Map fades in after settings loaded

- **WHEN** settings finish loading (persisted coordinate or defaults available)
- **THEN** the map SHALL animate from opacity 0 to opacity 1 over ~200ms

#### Scenario: No visible flash of null island

- **WHEN** the app launches cold
- **THEN** the user SHALL NOT see the map centered at `[0, 0]` at any point

### Requirement: AppSettings schema includes GPS coordinate fields

The `AppSettings` interface SHALL include `lastGpsLatitude` and `lastGpsLongitude` as nullable number fields.

#### Scenario: Settings loaded with persisted coordinate

- **WHEN** `getSettings()` is called and a coordinate was previously persisted
- **THEN** the returned `AppSettings` SHALL contain numeric `lastGpsLatitude` and `lastGpsLongitude` values

#### Scenario: Settings loaded with no prior coordinate

- **WHEN** `getSettings()` is called and no coordinate was previously persisted
- **THEN** the returned `AppSettings` SHALL contain `null` for both `lastGpsLatitude` and `lastGpsLongitude`

#### Scenario: Coordinate updated via updateSetting

- **WHEN** `updateSetting("lastGpsLatitude", value)` or `updateSetting("lastGpsLongitude", value)` is called
- **THEN** the value SHALL be durably persisted and available on next `getSettings()` call

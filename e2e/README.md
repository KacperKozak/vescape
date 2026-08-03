# E2E

Maestro flows exercise the installed app like a user: tap, type, assert visible UI.

## Local Android

1. Install Maestro CLI: https://docs.maestro.dev/getting-started/installing-maestro
2. Start an emulator.
3. Build/install the app in E2E mode:

```sh
bun run android:e2e
```

4. Run all E2E flows:

```sh
bun run e2e --all
```

Run one flow by file name:

```sh
bun run e2e --flow connect-board
```

Run without flags to pick from an interactive selector:

```sh
bun run e2e
```

Public flows live in `e2e/flows/*.yaml`. Helper flows start with `_` and are hidden from
the selector.

The first example clears app state, opens the board selector, taps Add new board, uses `EXPO_PUBLIC_E2E=1` to surface a fake BLE scan result named `E2E VESC Board`, creates `E2E Board`, keeps default battery config, saves, then checks the board name appears on the main screen.

Because this repo currently installs an Expo development build, the flow first selects the local Metro server from the Expo dev-client launcher. The dev-client config hides the tools button, skips onboarding, and prevents the dev menu from opening at launch. Those settings are native config plugin values, so rebuild the Android app after changing them.

## Seeded live telemetry

Use the private `e2e-seed` route to put the app into a deterministic connected-board state. It
creates `E2E Board`, connects it, and starts the native fake telemetry feed. This is useful for
visual checks and rendering/performance work without manually completing the add-board flow.

The seed requires an E2E build and a Metro server:

```sh
bun run android:e2e
```

Run the helper flow to clear app state, select Metro, seed/connect the fake board, and land on the
live telemetry screen:

```sh
maestro test e2e/flows/_perf-home.yaml
```

`_perf-home.yaml` is deliberately private: helper flows start with `_` and are excluded from
`bun run e2e --all`. Its deep link is:

```text
vescape://e2e-seed?flow=connect-board
```

Do not use the deep link alone for perf baselines: it does not clear prior app state or select the
dev-client Metro server. Use `_perf-home.yaml` first.

Measure a seeded telemetry screen with the bundled harness:

```sh
bun run perf --label telemetry --seconds 20
```

The harness runs `_perf-home.yaml` by default, resets `gfxinfo`, then records frame stats and
best-effort per-thread CPU. After manually preparing the same screen, skip setup with:

```sh
bun run perf --label telemetry --seconds 20 --no-setup
```

Future board-session flows should use an E2E native simulation mode instead of mocking JS stores. Native still owns Board Session, BLE/GPS, telemetry, and durable storage.

## Store screenshots

`e2e/flows/screenshots/*.yaml` capture the eight store panels from the real app, driven by
`scripts/screenshots.ts`:

```sh
bun run screenshots                 # asks for platform, then device
bun run screenshots --platform ios  # skip the platform picker
```

The bare command asks for the platform first (Android / iOS / Both), then the device. "Both" is a
deliberate choice rather than the default: the runs are sequential, so a whole Android pass — build,
eight panels, the sparkline wait — happens before iOS starts.

One flow set drives both platforms. The runner passes `OUT_DIR` to Maestro
(`screenshots/android` or `screenshots/ios`), so the panel list, order and filenames are identical
and the two sets can be compared side by side. The flows never use `back`: they dismiss through the
same on-screen controls a rider taps (`weather-exit`, `legal-limits-exit`, `history-back`,
`header-back`, `map-exit`, drawer backdrops), because Android's hardware back has no iOS equivalent
for overlay view states. Anything genuinely platform-specific lives in `scripts/lib/androidCapture.ts`
and `scripts/lib/iosCapture.ts` behind the `CaptureDriver` contract, not in a second flow set.

Both runs pin the device to Wrocław old town (`CAPTURE_LOCATION`): `xcrun simctl location set` on
iOS, `adb emu geo fix` on an Android emulator. Replay does own position — the recording's GPS fixes
are replayed alongside its chunks — but the pin still decides the backdrop before the first replayed
fix lands, and without it the two sets stop being comparable at boot. A physical Android device keeps its own location — mocking it would mean
installing a provider app.

iOS captures on an **iPhone 17 Pro Max simulator** (1320x2868, the 6.9" size App Store Connect
requires; Apple downscales to the rest). A physical device is not an option — `simctl status_bar`,
which pins the clock, battery and signal for the whole run, has no device equivalent. The fixture
zip is copied straight into the simulator container
(`xcrun simctl get_app_container <udid> <bundle> data` → `Documents/`); Android pushes it to the
app's external files dir with `adb`.

A screenshot build is a **Release** build with `EXPO_PUBLIC_SCREENSHOTS=1` and `EXPO_PUBLIC_E2E`
**unset**. That distinction is load-bearing: `EXPO_PUBLIC_E2E=1` reroutes `getBoards`,
`getLiveState`, `getTelemetryHistory` and friends to `e2eFake`, while `startDebugReplay` always goes
to native — an E2E build would run a replay session the UI never sees. Screenshot mode uses the real
native module end to end, and only suppresses developer chrome (replay badge, `REC`, no-board pill,
render-rate warning).

Data comes from two existing mechanisms, no new native code:

- durable (history, boards, tunes, alerts): a backup zip at `shared/fixtures/screenshot-db.zip`,
  staged into the app's fixture dir (`src/config/screenshotMode.ts`) and restored by
  `restoreDatabase` on startup — Room on Android, GRDB on iOS, already `@parity` peers.
- live (home hero panel): `startDebugReplay` at 1x through the real telemetry pipeline.

`screenshots/` is gitignored; the fixture zip is committed. It is generated from a real backup by

```sh
bun run scripts/sanitize-db-fixture.ts <backup.zip> [--rides 2]
```

which keeps the last rides, drops diagnostics, Privacy Zones, Board Warnings, favorites and every
other board, renames the board/tunes/rider and the device MAC, then rebases every timestamp so the
newest ride reads as today. Re-run it when the dates look stale. Without the zip the run still
works, with empty history.

Fixture names travel as build-time env (`EXPO_PUBLIC_SCREENSHOTS_REPLAY`, `EXPO_PUBLIC_SCREENSHOTS_DB`)
rather than a manifest file the app reads. On Android `expo-file-system` sandboxes paths outside the
app's document and cache directories, so it cannot read the external files dir the runner pushes
into — only native `restoreDatabase` can, via a `ContentResolver` open.

Iterate on one panel:

```sh
bun run screenshots --panel 4
```

The device picker is the same arrow-key list as the platform one (↑/↓ or j/k, Enter, Esc to cancel):
attached devices and existing AVDs with their resolutions on Android, available simulators on iOS. It warns when the
chosen device is not the store size (1080x2400 for Play, iPhone 17 Pro Max for App Store Connect).
`--device <serial|udid|name>` skips the picker and needs an explicit `--platform`.

It builds the screenshot build every run by default, because the installed package id alone cannot
distinguish one from an ordinary dev install and capturing against the wrong build produces a run
that goes nowhere. Pass `--no-build` to reuse what is installed once you have a screenshot build on
the device.

Other flags: `--replay <name>` (default `replay-thor301`), `--no-wait` (skip the sparkline wait),
`--platform android|ios|both` (default `both`).

The hero panel is captured last. `TelemetryPipeline.liveSeries` buckets the sparkline over
`liveHistoryLimit` minutes of receipt timestamps, so filling it takes that much session time. Replay
warmup covers the first three minutes up front: it plays as fast as it decodes against a clock
shifted that far into the past, which fills the window instead of compressing the samples into a
fraction of it (ADR 0024). The run waits out only whatever window is left beyond the warmup. The
replay recording must be at least as long as the whole run.

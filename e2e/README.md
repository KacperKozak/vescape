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
bun run screenshots
```

A screenshot build is a **Release** build with `EXPO_PUBLIC_SCREENSHOTS=1` and `EXPO_PUBLIC_E2E`
**unset**. That distinction is load-bearing: `EXPO_PUBLIC_E2E=1` reroutes `getBoards`,
`getLiveState`, `getTelemetryHistory` and friends to `e2eFake`, while `startDebugReplay` always goes
to native — an E2E build would run a replay session the UI never sees. Screenshot mode uses the real
native module end to end, and only suppresses developer chrome (replay badge, `REC`, no-board pill,
render-rate warning).

Data comes from two existing mechanisms, no new native code:

- durable (history, boards, tunes, alerts): a backup zip at `shared/fixtures/screenshot-db.zip`,
  pushed to the app's external files dir and restored by `restoreDatabase` on startup.
- live (home hero panel): `startDebugReplay` at 1x through the real telemetry pipeline.

Both `screenshots/` and the fixture zip are gitignored. Without the zip the run still works, with
empty history.

Iterate on one panel:

```sh
bun run screenshots --panel 4
```

The runner shows an arrow-key picker (↑/↓ or j/k, Enter, Esc to cancel) listing attached devices
and existing AVDs with their resolutions; it warns when the chosen one is not 1080x2400, the size
Play cuts phone screenshots to. `--device <serial>` skips the picker.

It builds the screenshot build every run by default, because the installed package id alone cannot
distinguish one from an ordinary dev install and capturing against the wrong build produces a run
that goes nowhere. Pass `--no-build` to reuse what is installed once you have a screenshot build on
the device.

Other flags: `--replay <name>` (default `replay-thor301`), `--no-wait` (skip the sparkline wait).

The hero panel is captured last. `TelemetryPipeline.liveSeries` buckets the sparkline over
`liveHistoryLimit` minutes of receipt timestamps, so a full sparkline needs that much wall clock at
1x. There is deliberately no playback-rate knob — fast-forwarding would compress the samples into a
fraction of the window instead of filling it. The replay recording must be at least as long as the
whole run.

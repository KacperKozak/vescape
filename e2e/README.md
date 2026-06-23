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
vescpoc://e2e-seed?flow=connect-board
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

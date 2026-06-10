# E2E

Maestro flows exercise the installed app like a user: tap, type, assert visible UI.

## Local Android

1. Install Maestro CLI: https://docs.maestro.dev/getting-started/installing-maestro
2. Start an emulator.
3. Build/install the app in E2E mode:

```sh
bun run android:e2e
```

4. Run the E2E flow:

```sh
bun run e2e
```

The first example clears app state, opens the board selector, taps Add new board, uses `EXPO_PUBLIC_E2E=1` to surface a fake BLE scan result named `E2E VESC Board`, creates `E2E Board`, keeps default battery config, saves, then checks the board name appears on the main screen.

Because this repo currently installs an Expo development build, the flow first selects the local Metro server from the Expo dev-client launcher. The dev-client config hides the tools button, skips onboarding, and prevents the dev menu from opening at launch. Those settings are native config plugin values, so rebuild the Android app after changing them.

Future board-session flows should use an E2E native simulation mode instead of mocking JS stores. Native still owns Board Session, BLE/GPS, telemetry, and durable storage.

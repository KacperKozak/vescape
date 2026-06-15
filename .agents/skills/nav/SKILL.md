---
name: nav
description: Navigate the app on a connected Android device using Maestro deep links, ADB screenshots, and tap/swipe commands. Use when user says "navigate to", "go to", "open screen", "show me", "/nav", or wants to interact with the running app on device.
---

# Device Navigation

Navigate the running app on a connected Android device. Combines Maestro deep links for screen navigation with ADB for visual feedback and interaction.

## Rules

- Always verify device connected (`adb devices`) before first command.
- App package: `com.anonymous.vescpoc`
- URL scheme: `vescpoc://`
- Never force-stop or clear data unless user asks.
- After navigation, take screenshot to confirm result.

## Navigate to Screen

Use Maestro deep link — fastest way to reach any screen:

```sh
maestro test <(cat <<EOF
appId: com.anonymous.vescpoc
---
- openLink: "vescpoc://<route>"
- waitForAnimationToEnd
EOF
)
```

## App Routes

Reference from `src/navigation/routes.ts`:

| Route key                    | Deep link path                   |
| ---------------------------- | -------------------------------- |
| home                         | `/`                              |
| profile                      | `/profile`                       |
| settings                     | `/settings`                      |
| settingsDev                  | `/settings/dev`                  |
| settingsComponents           | `/settings/components`           |
| settingsDiagnostic           | `/settings/diagnostic`           |
| settingsNavigationDiagnostic | `/settings/navigationDiagnostic` |
| settingsOther                | `/settings/other`                |
| settingsSoundPlayground      | `/settings/soundPlayground`      |
| settingsDiagnosticEvents     | `/settings/eventLog`             |
| settingsPrivacyZones         | `/settings/privacy-zones`        |
| tune                         | `/tune`                          |
| tuneHistory                  | `/tune/history`                  |
| addBoardScan                 | `/addBoard/scan`                 |
| addBoard                     | `/addBoard`                      |
| editBoard                    | `/editBoard/[boardId]`           |
| controlSpeed                 | `/control/speed`                 |
| controlBattery               | `/control/battery`               |
| controlDuty                  | `/control/duty`                  |
| controlTemperatures          | `/control/temperatures`          |
| controlCurrents              | `/control/currents`              |
| controlState                 | `/control/state`                 |
| controlFootpad               | `/control/footpad`               |
| controlImu                   | `/control/imu`                   |

If a route is not listed, check `src/navigation/routes.ts` for updates.

## Screenshot (Look)

Take and view a screenshot to see current device state:

```sh
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png /tmp/screen.png
```

Then read `/tmp/screen.png` with the Read tool.

## Interact

Tap at coordinates (get from screenshot):

```sh
adb shell input tap <x> <y>
```

Swipe (scroll down):

```sh
adb shell input swipe 500 1500 500 500
```

Type text:

```sh
adb shell input text "hello"
```

Press back:

```sh
adb shell input keyevent KEYCODE_BACK
```

## Maestro Interactions

For more reliable element-based interaction, use inline Maestro flows:

```sh
maestro test <(cat <<EOF
appId: com.anonymous.vescpoc
---
- tapOn: "Button Text"
EOF
)
```

```sh
maestro test <(cat <<EOF
appId: com.anonymous.vescpoc
---
- scrollUntilVisible:
    element: "Target Text"
    direction: DOWN
EOF
)
```

## Pattern: Navigate + Verify

1. Deep link to target screen.
2. Screenshot to confirm (use `/ss` skill).
3. Interact if needed.
4. Screenshot to verify result.

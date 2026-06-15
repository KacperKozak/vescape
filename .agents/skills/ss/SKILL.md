---
name: ss
description: Take a screenshot from a connected Android device and optionally upload it to a GitHub PR. Use when agent needs to see what's on the phone screen, verify UI changes visually, or attach screenshots to PRs. Triggered by "/ss", "take a screenshot", "what does the screen look like", or automatically by /to-pr when UI files changed.
---

# Screenshot

Two modes: **look** (see device screen) and **upload** (embed in PR).

## Preflight

Device must be connected. Skip silently if not:

```sh
adb devices | grep -w device | head -1
```

No device -> report "no device connected" and stop. Do not fail the parent workflow.

## Navigation

Before taking a screenshot, navigate to the right screen. Use Maestro deep links:

```sh
maestro test <(cat <<EOF
appId: com.anonymous.vescpoc
---
- openLink: "vescpoc://<route>"
- waitForAnimationToEnd
EOF
)
```

Route table is in `/nav` skill (`src/navigation/routes.ts`). Common routes:

| Screen          | Route              |
| --------------- | ------------------ |
| Home (map)      | `/`                |
| Settings        | `/settings`        |
| Tune            | `/tune`            |
| Speed control   | `/control/speed`   |
| Battery control | `/control/battery` |

For the full list, check `/nav` skill or `src/navigation/routes.ts`.

## Mode: Look

Take screenshot and view it to understand current device state:

```sh
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png /tmp/screen.png
```

Then read `/tmp/screen.png` with the Read tool. Use this during development to verify UI changes look correct.

## Mode: Upload (for PRs)

Take screenshot, upload to GitHub, get markdown image URL:

```sh
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png /tmp/screen.png
bun run scripts/gh-upload-screenshot.ts /tmp/screen.png --pr <number>
```

Script outputs `![screenshot](url)` — embed directly in PR body.

## When /to-pr should use this

After creating/updating a PR, check if screenshots make sense:

1. **Check diff for UI files**: `git diff dev...HEAD --name-only` contains files in `src/screens/`, `src/components/`, `src/app/` (route files), or theme/style changes.
2. **Check device connected**: `adb devices` shows a device.
3. **Both true** -> determine which screen(s) changed, use `/nav` to navigate there, then `/ss` upload mode.
4. **Either false** -> skip screenshots silently.

Determine affected screen from changed files:

- `src/screens/<name>/` or `src/app/<route>.tsx` -> navigate to that route.
- `src/components/` only -> navigate to the screen that uses the changed component (grep for imports).
- Multiple screens -> screenshot the most relevant one (largest diff).

## Cleanup

Remove screenshot releases for merged/closed PRs:

```sh
bun run scripts/gh-upload-screenshot.ts --clean
```

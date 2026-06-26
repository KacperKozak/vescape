---
name: wear
description: Build, sign, install, launch, and smoke-check local Wear OS app on Kacper's OnePlus Watch 3.
---

# Wear

Use when user says `/wear`, asks update watch app, build/push Wear changes, install to watch, or debug local Wear install.

Caveman style. Short. Command facts.

## Rules

- Durable Wear source: `watch/wearos`.
- Generated native target: `android/wearos`. Gitignored. Do not make lasting edits there.
- Before build, sync source:

```bash
rm -rf android/wearos && cp -R watch/wearos android/wearos
```

- Use Gradle for native Android builds. Package manager rules still: no `npm`, `yarn`, `pnpm`, `npx`.
- Use `adb devices -l` first.
- Prefer `adb -t <transport_id>` for watch. OnePlus Watch often appears twice via mDNS.
- Do not uninstall unless install says `INSTALL_FAILED_UPDATE_INCOMPATIBLE` or user asks.

## Known Devices

- Watch: OnePlus Watch 3 / `OPWWE231`.
- Watch mDNS often:
  - `adb-H631105000004E4R000011-NIEs41._adb-tls-connect._tcp`
  - `adb-H631105000004E4R000011-NIEs41 (2)._adb-tls-connect._tcp`
- Known watch transport often: `25` or `24`. Recheck every run.
- Phone package and watch package both: `app.vescape`.
- Watch activity: `app.vescape/.wear.MainActivity`.

## Build

```bash
rm -rf android/wearos && cp -R watch/wearos android/wearos
cd android && ./gradlew :wearos:assembleDebug
```

## Sign

Data Layer needs same package + same cert on phone and watch. Phone debug cert lives at `android/app/debug.keystore`.

If cert mismatch, watch logs show:

```text
WearableService: Mismatched certificate
WearableService: Failed to deliver message ... action=/telemetry
```

Sign Wear APK with phone debug cert:

```bash
BUILD_TOOLS="$ANDROID_HOME/build-tools/37.0.0"
if [ ! -x "$BUILD_TOOLS/zipalign" ]; then BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -type d | sort -V | tail -n 1)"; fi
cp android/wearos/build/outputs/apk/debug/wearos-debug.apk /tmp/wearos-debug-phone-cert.apk
"$BUILD_TOOLS/zipalign" -f -p 4 /tmp/wearos-debug-phone-cert.apk /tmp/wearos-debug-phone-cert-aligned.apk
"$BUILD_TOOLS/apksigner" sign \
  --ks android/app/debug.keystore \
  --ks-key-alias androiddebugkey \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out /tmp/wearos-debug-phone-cert-signed.apk \
  /tmp/wearos-debug-phone-cert-aligned.apk
```

## Install + Launch

```bash
adb devices -l
adb -t <watch-transport-id> install -r /tmp/wearos-debug-phone-cert-signed.apk
adb -t <watch-transport-id> shell pm grant app.vescape android.permission.POST_NOTIFICATIONS || true
adb -t <watch-transport-id> shell am start -n app.vescape/.wear.MainActivity
```

If incompatible update:

```bash
adb -t <watch-transport-id> uninstall app.vescape
adb -t <watch-transport-id> install /tmp/wearos-debug-phone-cert-signed.apk
adb -t <watch-transport-id> shell am start -n app.vescape/.wear.MainActivity
```

## Smoke Check

Check ongoing notification / Wear app:

```bash
adb -t <watch-transport-id> shell dumpsys notification --noredact | rg -i "app.vescape|Vescape|vescape_watch_mirror|Telemetry mirror active|numOngoing" -n -C 2
adb -t <watch-transport-id> logcat -b crash -d -t 80 | rg -i "app.vescape|AndroidRuntime|FATAL EXCEPTION" -n -C 2 || true
```

Expected:

- install success
- launch success
- notification permission granted
- ongoing notification exists
- no fresh crash

## Debug Disconnect

Phone must see board telemetry. Phone pushes watch frames only when watch presence true.

Phone logs:

```bash
adb -s <phone-serial> logcat -s VescSession
```

Good:

```text
Watch mirror debug node fallback: true nodes=1
Watch mirror presence initial: true capability=false
```

Watch `DISCONNECTED` causes:

- phone not pushing frames -> presence false
- cert mismatch -> `Mismatched certificate`
- no board session -> no telemetry source
- watch slept/paused -> reconnect should happen fast

## Full One-Liner Flow

Use after code changes when watch connected:

```bash
adb devices -l
rm -rf android/wearos && cp -R watch/wearos android/wearos
cd android && ./gradlew :wearos:assembleDebug
cd ..
BUILD_TOOLS="$ANDROID_HOME/build-tools/37.0.0"; if [ ! -x "$BUILD_TOOLS/zipalign" ]; then BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -type d | sort -V | tail -n 1)"; fi
cp android/wearos/build/outputs/apk/debug/wearos-debug.apk /tmp/wearos-debug-phone-cert.apk
"$BUILD_TOOLS/zipalign" -f -p 4 /tmp/wearos-debug-phone-cert.apk /tmp/wearos-debug-phone-cert-aligned.apk
"$BUILD_TOOLS/apksigner" sign --ks android/app/debug.keystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out /tmp/wearos-debug-phone-cert-signed.apk /tmp/wearos-debug-phone-cert-aligned.apk
adb -t <watch-transport-id> install -r /tmp/wearos-debug-phone-cert-signed.apk
adb -t <watch-transport-id> shell pm grant app.vescape android.permission.POST_NOTIFICATIONS || true
adb -t <watch-transport-id> shell am start -n app.vescape/.wear.MainActivity
```

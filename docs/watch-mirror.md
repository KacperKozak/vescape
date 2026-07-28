# Watch Mirror

The Watch Mirror is a Wear OS companion app under `watch/wearos/`. The phone app owns the Board
Session and pushes Watch Frames from native code; the watch only renders received frames.

## Google Play Release

Phone and Wear builds are separate signed AABs under the existing `app.vescape` Play listing:

```text
:app:bundleRelease    -> mobile internal       -> mobile production draft
:wearos:bundleRelease -> wear:internal completed -> wear:production draft
```

Both use the existing Android upload key. `APP_VERSION` supplies the shared package version name.
Phone version codes keep `major * 10000 + minor * 100 + patch`; Wear codes use
`1_000_000_000 + phoneVersionCode`. The disjoint range keeps every artifact code unique in the
shared listing and remains monotonic with package versions.

A `production-<version>` workflow retains both artifacts even when a Play upload fails:

```text
android/app/build/outputs/bundle/release/app-release.aab
android/wearos/build/outputs/bundle/release/wearos-release.aab
```

One-time Play Console setup remains human-owned:

1. Add the Wear OS form factor to the existing app.
2. Upload an accurate watch screenshot. Capture from the physical watch with
   `adb -s <watch-serial> exec-out screencap -p > wear-screenshot.png`.
3. Enable the dedicated Wear OS testing and production tracks.
4. Upload the first Wear AAB manually if Console requires it while enabling the form factor.
5. Opt into Wear OS review.

After CI publishes a test build, install both phone and watch apps from Play on the paired physical
devices. Launch the Watch Mirror, connect a Board on the phone, and confirm live telemetry reaches
the watch. This validates Play signing and Data Layer delivery together; local debug installs do not.

## Local Install

Pair/connect the watch with wireless ADB, then install the Wear app directly:

```bash
cd android
./gradlew :wearos:assembleDebug
adb -s <watch-serial> install -r wearos/build/outputs/apk/debug/wearos-debug.apk
adb -s <watch-serial> shell am start -n app.vescape/app.vescape.wear.MainActivity
```

Install the current phone app separately to the phone:

```bash
cd android
./gradlew :app:assembleDebug
adb -s <phone-serial> install -r app/build/outputs/apk/debug/app-debug.apk
```

When multiple ADB devices are connected, avoid `:app:installDebug` because Gradle may pick the watch
transport. Use explicit `adb -s <phone-serial> install ...`.

## Signing Must Match

Wear Data Layer delivery requires the phone and watch packages to have the same package name and
signing certificate. Both are `app.vescape`, but debug builds can still diverge:

- Phone debug APK is signed with `android/app/debug.keystore`.
- Wear debug APK may be signed with the user's global `~/.android/debug.keystore`.

When certs differ, watch logs show:

```text
WearableService: Mismatched certificate
WearableService: Failed to deliver message ... action=/telemetry
```

Fix by signing the Wear APK with the same debug keystore as the phone:

```bash
cp android/wearos/build/outputs/apk/debug/wearos-debug.apk /tmp/wearos-debug-phone-cert.apk
zipalign -f -p 4 /tmp/wearos-debug-phone-cert.apk /tmp/wearos-debug-phone-cert-aligned.apk
apksigner sign \
  --ks android/app/debug.keystore \
  --ks-key-alias androiddebugkey \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out /tmp/wearos-debug-phone-cert-signed.apk \
  /tmp/wearos-debug-phone-cert-aligned.apk
adb -s <watch-serial> uninstall app.vescape
adb -s <watch-serial> install /tmp/wearos-debug-phone-cert-signed.apk
```

Verify signatures if needed:

```bash
adb -s <phone-serial> shell dumpsys package app.vescape | rg 'signatures='
adb -s <watch-serial> shell dumpsys package app.vescape | rg 'signatures='
```

The signature ids must match.

## Presence And Frames

The phone only pushes frames when `WatchMirrorPresence.present` is true. Production uses the Wear
capability declared by the watch app. On local debug installs, `CapabilityClient` may report false even
when the watch app is installed and open. Debug builds can fall back to any reachable Wear node so local
testing is not blocked by capability propagation.

Useful phone log:

```bash
adb -s <phone-serial> logcat -s VescSession
```

Good local-debug output:

```text
Watch mirror debug node fallback: true nodes=1
Watch mirror presence initial: true capability=false
```

If the watch says `DISCONNECTED`, distinguish the cause:

- No `Watch mirror presence initial: true` on phone: the phone is not pushing frames.
- `Mismatched certificate` on watch: frames are pushed but rejected before app delivery.
- No board telemetry on phone: no Board Session, so there is no Watch Frame source.

The watch switches to `DISCONNECTED` when no Watch Frame arrives for about three watch ticks.

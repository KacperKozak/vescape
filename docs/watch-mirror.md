# Watch Mirror

The Watch Mirror is a Wear OS companion app under `watch/wearos/`. The phone app owns the Board
Session and pushes Watch Frames from native code; the watch only renders received frames.

## Google Play Release

Phone and Wear builds are separate signed AABs under the existing `app.vescape` Play listing:

```text
:app:bundleRelease    -> phone internal -> phone open testing
:wearos:bundleRelease -> wear:internal  -> wear open testing
```

Both use the existing Android upload key. `APP_VERSION` supplies the shared package version name.
CI allocates monotonic, disjoint phone and Wear version codes for every internal build and records
them, with the immutable source SHA and artifact hashes, in the release manifest.

`bun run release` offers separate internal-build and open-promotion actions. Open promotion selects
one successful internal manifest, requires canonical `release-notes/<version>.md`, and promotes the
manifest's exact existing codes. It never rebuilds or uploads an AAB. Track IDs come from the
`PLAY_PHONE_INTERNAL_TRACK`, `PLAY_PHONE_OPEN_TRACK`, `PLAY_WEAR_INTERNAL_TRACK`, and
`PLAY_WEAR_OPEN_TRACK` repository variables; defaults are `internal`, `beta`, `wear:internal`, and
`wear:beta`.

Before mutation, the trusted `main` workflow verifies both requested codes against Play. A code may
be on its internal source track or already on its open target track: this makes a retry converge after
phone-only or Wear-only success. Promotion then runs phone and Wear serially and publishes a
per-form-factor result (`promoted`, `already-open`, or `failed`). It does not touch production tracks,
tags, GitHub Releases, `main`, or `dev`.

The internal workflow retains both artifacts even when a Play upload fails:

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

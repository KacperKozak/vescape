# Native build sync

`ios/` and `android/` are generated state, not durable source. They drift from their durable inputs
whenever a branch switch, a config plugin edit, or a new native source file lands — and the failure
is confusing: Xcode cannot resolve a Swift type that is plainly sitting in `modules/vesc-ble/ios/`.

`scripts/native-sync.ts` fingerprints the durable inputs, compares them with the last successful
sync, and runs only the sync step that is actually stale. It is wired into the blessed run commands,
so there is nothing extra to remember:

```bash
bun run ios       # native:sync ios && expo run:ios --device
bun run android   # native:sync android && expo run:android --device
bun run native:sync ios   # sync only, no app run
```

Output always names the reason before it does anything (`+` added, `-` removed, `~` changed):

```text
native-sync ios: pod install refreshes the Pods project because:
  ~ modules/vesc-ble/ios#layout
```

## Two scopes

**Prebuild** (both platforms) — content hashes of `app.config.ts`, `package.json`, `bun.lock`,
`plugins/`, `patches/`, every `modules/*/expo-module.config.json` and `modules/*/package.json`, plus
`targets/` on iOS (`@bacons/apple-targets` copies those into the Xcode project). Any change here
means the generated native project is stale, so the script runs `expo prebuild --platform <p>`.

**Pods** (iOS only) — content hashes of `modules/*/ios/*.podspec`, plus a hash of the sorted **file
path list** under each `modules/*/ios/`. CocoaPods compiles whatever the podspec globbed at
`pod install` time, so a newly added Swift file stays invisible to Xcode until Pods are regenerated.
Editing an already-compiled file needs no refresh, which is why this scope hashes paths, not
contents — normal Swift work never pays for a `pod install`.

On iOS the two scopes chain: a prebuild regenerates the Podfile, and `expo prebuild` does not
reliably install from it, so every iOS sync ends with `pod install`. It is a fast no-op when Pods
already match.

## Why Android has no second scope

Gradle autolinking resolves Kotlin sources through a directory glob at build time, so adding a file
to `modules/*/android/` needs no regeneration step. Android only drifts through prebuild inputs, and
that scope is shared with iOS.

## Cache

The last successful fingerprint lives in `.expo/native-sync/<platform>.json` (gitignored, so it is
per-machine and per-checkout). It is written only after the sync command exits 0, and it fingerprints
the tree _after_ the sync, because prebuild can rewrite its own inputs. A missing cache — a fresh
clone, or after `bun run clear` — is treated as unknown state and triggers a prebuild.

To change what counts as a durable native input, edit the input lists at the top of
`scripts/native-sync.ts`. Never hand-edit `ios/` or `android/` to fix drift.

# Mapbox patches

This project carries a Bun patch for `@rnmapbox/maps@10.3.1`:

- `patches/@rnmapbox%2Fmaps@10.3.1.patch`
- registered in `package.json#patchedDependencies`
- applied automatically by `bun install`

## Direct camera pitch updates

The patch adds this imperative camera method:

```ts
cameraRef.current?.setCameraDirect({ pitch })
```

It is used by `src/screens/center/CenterMap.tsx` to continuously derive pitch from zoom while the
map camera is moving, including native deceleration after the user releases a pinch gesture. The
pitch calculation remains pure in `src/lib/map/cameraProfiles.ts` (`getPitchForZoom`).

### Why normal `setCamera` is not used

`Camera.setCamera({ pitch, animationDuration: 0 })` does not perform a neutral property write in
`@rnmapbox/maps`. On Android it reaches `CameraUpdateItem`, which calls Mapbox `flyTo` with a
zero-duration animation. Repeating that call from `onCameraChanged` starts camera transitions and
cancels the native pinch-zoom/deceleration transaction. The visible symptom is zoom momentum
stopping when automatic tilt changes.

`setCameraDirect` bypasses that transition queue:

- Android: `MapboxMap.setCamera(CameraOptions.Builder().pitch(pitch).build())`
- iOS: `mapboxMap.setCamera(to: CameraOptions(pitch: pitch))`

Use `setCameraDirect` only for camera properties that must track an already-running native camera
gesture or animation. Continue using normal `setCamera` for intentional app-driven camera moves,
such as focus, mode changes, recentering, and animated perspective toggles.

The current native bridge intentionally accepts only `pitch`. Do not broaden it to arbitrary camera
options without a concrete use case and gesture-behavior verification.

## Files changed inside `@rnmapbox/maps`

The patch updates all layers required by the package:

- public `CameraRef` API and implementation
- compiled JavaScript and TypeScript declarations shipped by the package
- TurboModule specification
- Android `RNMBXCameraModule`
- iOS `RNMBXCamera` and `RNMBXCameraModule`

Do not edit `node_modules` directly and leave it uncommitted. Update the durable Bun patch instead.

## Updating `@rnmapbox/maps`

When changing the dependency version:

1. Check whether upstream now provides a non-transitioning camera-property API.
2. If it does, migrate `CenterMap` to that API and remove this patch.
3. Otherwise recreate the patch against the new version with `bun patch @rnmapbox/maps`.
4. Reapply the direct setter to source, compiled output, declarations, TurboModule spec, Android, and
   iOS.
5. Commit it with `bun patch --commit 'node_modules/@rnmapbox/maps'`.
6. Verify a clean `bun install` applies it.
7. Rebuild the native app. Metro refresh is insufficient for native patch changes.

Minimum verification:

```sh
bun run ts
bun test src/lib/map/cameraProfiles.test.ts
cd android && ./gradlew :app:compileDebugKotlin
```

On a device, pinch and release quickly in map mode. Zoom must keep decelerating while pitch follows
the changing zoom. Also verify normal recentering and navigation-mode camera animations.

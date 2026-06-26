import { withDangerousMod, type ConfigPlugin } from 'expo/config-plugins'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Injects the git-tracked Wear OS Mirror (`watch/wearos/`) into the Expo-generated `android/`
 * project on every prebuild (ADR-0019). `android/` is gitignored, so the companion's durable source
 * cannot live there — this plugin copies it in and wires the Gradle build, the same pattern as
 * `withGradleJvmArgs`. It is load-bearing: keep it in step with the watch module's package name and
 * Gradle layout.
 *
 * Steps, all idempotent:
 *  1. Copy `watch/wearos/` -> `android/wearos/` (clean copy each prebuild).
 *  2. Register the module: `include ':wearos'` in `android/settings.gradle`.
 *  3. Embed the watch APK via the legacy `wearApp` configuration so store builds auto-install it to
 *     the paired watch. Guarded by a `findByName` check so phone builds never break on AGP versions
 *     that drop the configuration — dev installs the watch APK directly with `adb install` anyway.
 */
const GRADLE_MODULE = ':wearos'
const WATCH_SOURCE_DIR = path.join('watch', 'wearos')
const APP_GRADLE_MARKER = '// @generated withWearMirror'

const withWearMirror: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot
      const androidRoot = cfg.modRequest.platformProjectRoot

      const source = path.join(projectRoot, WATCH_SOURCE_DIR)
      if (!existsSync(source)) {
        throw new Error(`[withWearMirror] missing watch source at ${source}`)
      }

      // 1. Copy the watch source into the generated project.
      const dest = path.join(androidRoot, 'wearos')
      rmSync(dest, { recursive: true, force: true })
      cpSync(source, dest, { recursive: true })

      // 2. Register the Gradle module.
      const settingsPath = path.join(androidRoot, 'settings.gradle')
      const settings = readFileSync(settingsPath, 'utf8')
      const includeLine = `include '${GRADLE_MODULE}'`
      if (!settings.includes(includeLine)) {
        writeFileSync(settingsPath, `${settings.trimEnd()}\n${includeLine}\n`)
      }

      // 3. Embed the watch APK in the phone app for store-build auto-install.
      const appGradlePath = path.join(androidRoot, 'app', 'build.gradle')
      const appGradle = readFileSync(appGradlePath, 'utf8')
      if (!appGradle.includes(APP_GRADLE_MARKER)) {
        const block = [
          '',
          APP_GRADLE_MARKER,
          'dependencies {',
          '    // Legacy embedded wear app: only wire it when AGP exposes the wearApp configuration.',
          "    if (configurations.findByName('wearApp') != null) {",
          `        wearApp project('${GRADLE_MODULE}')`,
          '    }',
          '}',
          '',
        ].join('\n')
        writeFileSync(appGradlePath, `${appGradle.trimEnd()}\n${block}`)
      }

      return cfg
    },
  ])

export default withWearMirror

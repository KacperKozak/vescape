/**
 * Android side of the store screenshot runner: emulator/device selection, the Release screenshot
 * build, `adb push`ed fixtures and SystemUI demo mode.
 *
 * @parity /scripts/lib/iosCapture.ts
 */
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'

import { applicationId } from '../../src/config/appVariant.ts'
import {
  capture,
  CAPTURE_LOCATION,
  FIXTURE_ZIP,
  runOrDie,
  screenshotBuildEnv,
  warnMissingFixture,
  type CaptureDriver,
} from './captureDriver.ts'
import { select, type SelectOption } from './select.ts'

const OUT_DIR = 'screenshots/android'

/** Mirrors `screenshotFixtureDir` in `src/config/screenshotMode.ts`. */
const DEVICE_FIXTURE_DIR = `/storage/emulated/0/Android/data/${applicationId}/files`

/** Play's phone screenshots are cut to this; anything else has to be rescaled by hand. */
const TARGET_RESOLUTION = '1080x2400'

/**
 * `emulator` is not on a plain `PATH` unless the developer put it there, so resolve it from the SDK
 * the way Gradle does. Only the SDK root is consulted — nothing here is machine-specific, and a
 * missing SDK stays the environment's problem to fix, not the script's to paper over.
 */
function emulatorBin(): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  const fromSdk = sdk ? join(sdk, 'emulator', 'emulator') : null
  return fromSdk && existsSync(fromSdk) ? fromSdk : 'emulator'
}

/**
 * A device the runner can drive.
 *
 * `serial` addresses it over adb; `name` is what `expo run:android --device` matches on, and the two
 * are not interchangeable — Expo names an emulator by its AVD (`Medium_Phone`, not `emulator-5554`)
 * and a physical device by its `model:` field.
 */
interface Device {
  serial: string
  name: string
}

async function attachedSerials(): Promise<string[]> {
  const out = await capture(['adb', 'devices'])
  return out
    .split('\n')
    .slice(1)
    .filter((line) => line.includes('\tdevice'))
    .map((line) => line.split('\t')[0].trim())
}

/** The AVD behind a running emulator serial, which is also the name Expo knows it by. */
async function runningAvdName(serial: string): Promise<string | null> {
  if (!serial.startsWith('emulator-')) return null
  const out = await capture(['adb', '-s', serial, 'emu', 'avd', 'name'])
  return out.split('\n')[0].trim() || null
}

async function attachedDevices(): Promise<Device[]> {
  const out = await capture(['adb', 'devices', '-l'])
  const lines = out
    .split('\n')
    .slice(1)
    .filter((line) => line.includes(' device ') || line.includes('\tdevice'))

  return Promise.all(
    lines.map(async (line) => {
      const serial = line.split(/\s+/)[0].trim()
      const name = (await runningAvdName(serial)) ?? /model:(\S+)/.exec(line)?.[1] ?? serial
      return { serial, name }
    }),
  )
}

async function listAvds(): Promise<string[]> {
  const out = await capture([emulatorBin(), '-list-avds'])
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** An AVD's screen size, read from its own config — the store set must be one consistent size. */
function avdResolution(name: string): string | null {
  const config = join(homedir(), '.android', 'avd', `${name}.avd`, 'config.ini')
  if (!existsSync(config)) return null
  const text = readFileSync(config, 'utf8')
  const width = /^hw\.lcd\.width=(\d+)$/m.exec(text)?.[1]
  const height = /^hw\.lcd\.height=(\d+)$/m.exec(text)?.[1]
  return width && height ? `${width}x${height}` : null
}

/** Boots an existing AVD and returns it once adb reports it ready. */
async function bootAvd(name: string): Promise<Device> {
  const before = await attachedSerials()
  console.log(`› Booting ${name}…`)
  Bun.spawn([emulatorBin(), '-avd', name, '-no-boot-anim', '-no-snapshot'], {
    stdout: 'ignore',
    stderr: 'ignore',
  })

  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const serial = (await attachedSerials()).find((id) => !before.includes(id))
    if (serial) {
      const booted = (
        await capture(['adb', '-s', serial, 'shell', 'getprop', 'sys.boot_completed'])
      ).trim()
      if (booted === '1') return { serial, name }
    }
    await Bun.sleep(2000)
  }
  console.error(`${name} did not finish booting within 180s.`)
  process.exit(1)
}

/** `adb-54151FDAS00077-x5XeY4._adb-tls-connect._tcp` → `54151FDAS00077`. */
function shortSerial(serial: string): string {
  return serial.replace(/^adb-/, '').replace(/-\w+\._adb-tls-connect\._tcp$/, '')
}

type DeviceChoice = { kind: 'attached'; device: Device } | { kind: 'avd'; name: string }

async function chooseDevice(attached: Device[]): Promise<DeviceChoice> {
  const options: SelectOption<DeviceChoice>[] = attached.map((device) => ({
    label: device.name,
    value: { kind: 'attached', device },
    hint: shortSerial(device.serial),
  }))

  // An AVD that is already up is listed once, as the running device — offering to "boot" it again
  // would be the same device under a second name.
  const running = new Set(attached.map((device) => device.name))
  for (const name of await listAvds()) {
    if (running.has(name)) continue
    options.push({
      label: `boot ${name}`,
      value: { kind: 'avd', name },
      hint: avdResolution(name) ?? 'AVD',
    })
  }

  if (options.length === 0) {
    console.error('No device attached and no AVD available.')
    process.exit(1)
  }
  if (options.length === 1) return options[0].value
  return select('Android capture device', options)
}

async function resolveDevice(requested: string | null): Promise<Device> {
  const attached = await attachedDevices()

  if (requested) {
    const match = attached.find((d) => d.serial === requested || d.name === requested)
    if (!match) {
      console.error(`No attached device matches "${requested}".`)
      process.exit(1)
    }
    return match
  }

  const choice = await chooseDevice(attached)
  const device = choice.kind === 'avd' ? await bootAvd(choice.name) : choice.device
  await warnOnResolution(device.serial)
  return device
}

/** Play cuts phone screenshots to one size; capturing at another means rescaling by hand later. */
async function warnOnResolution(device: string): Promise<void> {
  const size = /(\d+x\d+)/.exec(await capture(['adb', '-s', device, 'shell', 'wm', 'size']))?.[1]
  if (size && size !== TARGET_RESOLUTION) {
    console.warn(`  device is ${size}, not the ${TARGET_RESOLUTION} the store set expects`)
  }
}

const ANIMATION_SCALES = [
  'window_animation_scale',
  'transition_animation_scale',
  'animator_duration_scale',
]

export async function createAndroidDriver(
  requestedDevice: string | null,
  replay: string,
): Promise<CaptureDriver> {
  const device = await resolveDevice(requestedDevice)
  const adb = (...rest: string[]) => capture(['adb', '-s', device.serial, ...rest])

  return {
    platform: 'android',
    outDir: OUT_DIR,
    deviceId: device.serial,
    deviceLabel: `${device.name} (${device.serial})`,

    async buildAndInstall() {
      console.log('› Building the Android screenshot Release build…')
      await runOrDie(['bun', 'run', 'native:sync', 'android'])
      // `--device` takes Expo's device name, not the adb serial.
      await runOrDie(
        ['bunx', 'expo', 'run:android', '--variant', 'release', '--device', device.name],
        screenshotBuildEnv(replay),
      )
    },

    async requireInstalled() {
      const out = await adb('shell', 'pm', 'list', 'packages', applicationId)
      if (!out.includes(`package:${applicationId}`)) {
        console.error(`${applicationId} is not installed on ${device.name}; drop --no-build.`)
        process.exit(1)
      }
    },

    async stageFixtures() {
      console.log('› Staging fixtures…')
      // `pm clear` wipes the external files dir too, so it has to come before the push.
      await adb('shell', 'pm', 'clear', applicationId)

      if (existsSync(FIXTURE_ZIP)) {
        await adb('push', FIXTURE_ZIP, `${DEVICE_FIXTURE_DIR}/${basename(FIXTURE_ZIP)}`)
      } else {
        warnMissingFixture()
      }

      for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
        await adb('shell', 'pm', 'grant', applicationId, `android.permission.${permission}`)
      }
    },

    async pinLocation() {
      // `geo fix` is an emulator console command; a physical device would need a mock provider app,
      // which is well past what a screenshot run should install.
      if (!device.serial.startsWith('emulator-')) {
        console.warn('  physical device: location left as-is, the map backdrop will not match iOS')
        return
      }
      const { latitude, longitude } = CAPTURE_LOCATION
      await adb('emu', 'geo', 'fix', String(longitude), String(latitude))
    },

    async setChrome(clean: boolean) {
      for (const scale of ANIMATION_SCALES) {
        await adb('shell', 'settings', 'put', 'global', scale, clean ? '0' : '1')
      }

      // SystemUI demo mode pins the status bar so panels do not disagree on clock or battery.
      await adb('shell', 'settings', 'put', 'global', 'sysui_demo_allowed', clean ? '1' : '0')
      const demo = (...args: string[]) =>
        adb('shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', ...args)
      if (!clean) {
        await demo('command', 'exit')
        return
      }
      await demo('command', 'enter')
      await demo('command', 'clock', '-e', 'hhmm', '0941')
      await demo('command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false')
      await demo('command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4')
      await demo(
        'command',
        'network',
        '-e',
        'mobile',
        'show',
        '-e',
        'level',
        '4',
        '-e',
        'datatype',
        'none',
      )
      await demo('command', 'notifications', '-e', 'visible', 'false')
    },
  }
}

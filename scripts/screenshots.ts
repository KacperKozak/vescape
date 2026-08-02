#!/usr/bin/env bun
/**
 * Store screenshot capture harness.
 *
 * Drives the real app — Release build, `EXPO_PUBLIC_SCREENSHOTS=1`, `EXPO_PUBLIC_E2E` unset — through
 * `e2e/flows/screenshots/*.yaml` and collects one PNG per panel. Data comes from two existing
 * mechanisms and no new native code: a database backup zip restored on startup (history, boards,
 * tunes, alerts) and a Debug Recording replayed at 1x through the real telemetry pipeline.
 *
 *   bun run screenshots               # all 8 panels; picks the device, or asks when several are up
 *   bun run screenshots --panel 4 --no-build  # one panel against the installed build
 *   bun run screenshots --device R5CT # skip the picker and target this serial
 *
 * The hero panel is captured last, on purpose. `TelemetryPipeline.liveSeries` buckets the sparkline
 * over `liveHistoryLimit` minutes of *receipt* timestamps, so a full sparkline needs that much wall
 * clock at 1x; there is deliberately no playback-rate knob, because fast-forwarding would compress
 * the samples into a fraction of the window instead of filling it. The replay recording must be at
 * least as long as the whole run.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { applicationId } from '../src/config/appVariant.ts'
import { select, SelectCancelled, type SelectOption } from './lib/select.ts'

const ROOT = join(import.meta.dir, '..')
const FLOWS_DIR = join(ROOT, 'e2e', 'flows', 'screenshots')
const OUT_DIR = join(ROOT, 'screenshots', 'android')
const FIXTURE_ZIP = join(ROOT, 'shared', 'fixtures', 'screenshot-db.zip')

/** Mirrors `screenshotFixtureDir` in `src/config/screenshotMode.ts`. */
const DEVICE_FIXTURE_DIR = `/storage/emulated/0/Android/data/${applicationId}/files/screenshots`

/** Play's phone screenshots are cut to this; anything else has to be rescaled by hand. */
const TARGET_RESOLUTION = '1080x2400'

const DEFAULT_REPLAY = 'replay-thor301'
/** `AppSettings.liveHistoryLimit` default — the sparkline window the hero panel has to fill. */
const DEFAULT_SPARKLINE_MINUTES = 5

interface Args {
  panel: number | null
  device: string | null
  replay: string
  sparklineMinutes: number
  noBuild: boolean
  noWait: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    panel: null,
    device: null,
    replay: DEFAULT_REPLAY,
    sparklineMinutes: DEFAULT_SPARKLINE_MINUTES,
    noBuild: false,
    noWait: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value == null) throw new Error(`Missing value for ${arg}`)
      i += 1
      return value
    }
    if (arg === '--panel') args.panel = Number(next())
    else if (arg === '--device') args.device = next()
    else if (arg === '--replay') args.replay = next()
    else if (arg === '--sparkline-minutes') args.sparklineMinutes = Number(next())
    else if (arg === '--no-build') args.noBuild = true
    else if (arg === '--no-wait') args.noWait = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.panel != null && !Number.isInteger(args.panel))
    throw new Error('--panel must be an integer')
  return args
}

// ── process helpers ──────────────────────────────────────────────────────────

async function capture(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(proc.stdout).text()
  await proc.exited
  return out
}

async function runOrDie(cmd: string[], env?: Record<string, string | undefined>): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
    ...(env ? { env } : {}),
  })
  const code = (await proc.exited) ?? 1
  if (code !== 0) {
    console.error(`Command failed (${code}): ${cmd.join(' ')}`)
    process.exit(code)
  }
}

// ── device ───────────────────────────────────────────────────────────────────

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

async function attachedDevices(): Promise<string[]> {
  const out = await capture(['adb', 'devices'])
  return out
    .split('\n')
    .slice(1)
    .filter((line) => line.includes('\tdevice'))
    .map((line) => line.split('\t')[0].trim())
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

/** Boots an existing AVD and returns its serial. */
async function bootAvd(name: string): Promise<string> {
  const before = await attachedDevices()
  console.log(`› Booting ${name}…`)
  Bun.spawn([emulatorBin(), '-avd', name, '-no-boot-anim', '-no-snapshot'], {
    stdout: 'ignore',
    stderr: 'ignore',
  })

  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const serial = (await attachedDevices()).find((id) => !before.includes(id))
    if (serial) {
      const booted = (
        await capture(['adb', '-s', serial, 'shell', 'getprop', 'sys.boot_completed'])
      ).trim()
      if (booted === '1') return serial
    }
    await Bun.sleep(2000)
  }
  console.error(`${name} did not finish booting within 180s.`)
  process.exit(1)
}

/** A serial like `adb-54151FDAS00077-x5XeY4._adb-tls-connect._tcp` is unreadable on its own. */
async function deviceModel(serial: string): Promise<string | null> {
  const model = (
    await capture(['adb', '-s', serial, 'shell', 'getprop', 'ro.product.model'])
  ).trim()
  return model || null
}

/** `adb-54151FDAS00077-x5XeY4._adb-tls-connect._tcp` → `54151FDAS00077`. */
function shortSerial(serial: string): string {
  return serial.replace(/^adb-/, '').replace(/-\w+\._adb-tls-connect\._tcp$/, '')
}

type DeviceChoice = { kind: 'serial'; serial: string } | { kind: 'avd'; name: string }

async function chooseDevice(attached: string[]): Promise<DeviceChoice> {
  const models = await Promise.all(attached.map(deviceModel))
  const options: SelectOption<DeviceChoice>[] = attached.map((serial, index) => ({
    label: models[index] ?? serial,
    value: { kind: 'serial', serial },
    hint: shortSerial(serial),
  }))

  for (const name of await listAvds()) {
    const resolution = avdResolution(name)
    options.push({
      label: `boot ${name}`,
      value: { kind: 'avd', name },
      hint: resolution ?? 'AVD',
    })
  }

  if (options.length === 1) return options[0].value
  return select('Capture device', options)
}

async function resolveDevice(args: Args): Promise<string> {
  if (args.device) return args.device

  const attached = await attachedDevices()
  const choice =
    attached.length === 1
      ? ({ kind: 'serial', serial: attached[0] } as const)
      : await chooseDevice(attached)

  const device = choice.kind === 'avd' ? await bootAvd(choice.name) : choice.serial
  await warnOnResolution(device)
  return device
}

/** Play cuts phone screenshots to one size; capturing at another means rescaling by hand later. */
async function warnOnResolution(device: string): Promise<void> {
  const size = /(\d+x\d+)/.exec(await capture(['adb', '-s', device, 'shell', 'wm', 'size']))?.[1]
  if (size && size !== TARGET_RESOLUTION) {
    console.warn(`  device is ${size}, not the ${TARGET_RESOLUTION} the store set expects`)
  }
}

// ── device prep ──────────────────────────────────────────────────────────────

async function installed(device: string): Promise<boolean> {
  const out = await capture(['adb', '-s', device, 'shell', 'pm', 'list', 'packages', applicationId])
  return out.includes(`package:${applicationId}`)
}

async function buildAndInstall(device: string): Promise<void> {
  console.log('› Building the screenshot Release build…')
  await runOrDie(['bun', 'run', 'native:sync', 'android'])
  // EXPO_PUBLIC_E2E must stay unset: it reroutes board and telemetry reads to `e2eFake`, which
  // would leave the native replay session invisible to the UI.
  const env: Record<string, string | undefined> = {
    ...process.env,
    EXPO_PUBLIC_SCREENSHOTS: '1',
  }
  delete env.EXPO_PUBLIC_E2E
  await runOrDie(['bunx', 'expo', 'run:android', '--variant', 'release', '--device', device], env)
}

async function pushFixtures(device: string, replay: string): Promise<void> {
  const adb = (...rest: string[]) => capture(['adb', '-s', device, ...rest])

  console.log('› Staging fixtures…')
  // `pm clear` wipes the external files dir too, so it has to come before the push.
  await adb('shell', 'pm', 'clear', applicationId)
  await adb('shell', 'mkdir', '-p', DEVICE_FIXTURE_DIR)

  const manifest: { database?: string; replay?: string } = { replay }
  if (existsSync(FIXTURE_ZIP)) {
    manifest.database = basename(FIXTURE_ZIP)
    await adb('push', FIXTURE_ZIP, `${DEVICE_FIXTURE_DIR}/${manifest.database}`)
  } else {
    console.warn(
      `  no ${FIXTURE_ZIP} — capturing with replay telemetry only, history will be empty`,
    )
  }

  const manifestFile = join(OUT_DIR, '.manifest.json')
  writeFileSync(manifestFile, JSON.stringify(manifest))
  await adb('push', manifestFile, `${DEVICE_FIXTURE_DIR}/manifest.json`)

  for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
    await adb('shell', 'pm', 'grant', applicationId, `android.permission.${permission}`)
  }
}

const ANIMATION_SCALES = [
  'window_animation_scale',
  'transition_animation_scale',
  'animator_duration_scale',
]

async function setChrome(device: string, clean: boolean): Promise<void> {
  const adb = (...rest: string[]) => capture(['adb', '-s', device, ...rest])
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
}

// ── capture ──────────────────────────────────────────────────────────────────

/** Panel flows, sorted: `NN-name.yaml`. Helpers start with `_`. */
function panelFlows(): string[] {
  return readdirSync(FLOWS_DIR)
    .filter((file) => file.endsWith('.yaml') && !file.startsWith('_'))
    .sort()
}

function selectPanels(args: Args): string[] {
  const flows = panelFlows()
  if (args.panel == null) return flows
  const prefix = String(args.panel).padStart(2, '0')
  const match = flows.find((file) => file.startsWith(`${prefix}-`))
  if (!match) {
    console.error(
      `Unknown panel ${args.panel}. Available: ${flows.map((f) => f.slice(0, 2)).join(', ')}`,
    )
    process.exit(1)
  }
  return [match]
}

async function runFlow(file: string, device: string): Promise<void> {
  console.log(`› ${basename(file, '.yaml')}`)
  // Without --device Maestro picks the first attached device itself, which silently drives whatever
  // else is plugged in rather than the one this run prepared.
  await runOrDie([
    'maestro',
    'test',
    '--device',
    device,
    '-e',
    `APP_ID=${applicationId}`,
    join(FLOWS_DIR, file),
  ])
}

async function main(args: Args): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const device = await resolveDevice(args)
  console.log(`Device: ${device}`)

  // Build by default: `installed()` only sees the package id, so it cannot tell a screenshot build
  // from an ordinary dev install, and reusing the wrong one produces a run that goes nowhere.
  if (args.noBuild) {
    if (!(await installed(device))) {
      console.error(`${applicationId} is not installed on ${device}; drop --no-build.`)
      process.exit(1)
    }
    console.log('› Reusing the installed build (--no-build) — it must be a screenshot build.')
  } else {
    await buildAndInstall(device)
  }

  await pushFixtures(device, args.replay)
  await setChrome(device, true)

  try {
    const selected = selectPanels(args)
    // The hero shot needs a full sparkline window, so it always goes last; everything else is shot
    // while the replay is still filling it.
    const hero = selected.filter((file) => file.startsWith('01-'))
    const rest = selected.filter((file) => !file.startsWith('01-'))

    const bootedAt = Date.now()
    await runFlow('_boot.yaml', device)
    for (const file of rest) await runFlow(file, device)

    if (hero.length > 0 && !args.noWait) {
      const remainingMs = args.sparklineMinutes * 60_000 - (Date.now() - bootedAt)
      if (remainingMs > 0) {
        console.log(`› Waiting ${Math.ceil(remainingMs / 1000)}s for the sparkline window to fill…`)
        await Bun.sleep(remainingMs)
      }
    }
    for (const file of hero) await runFlow(file, device)
  } finally {
    await setChrome(device, false)
  }

  console.log(`\nScreenshots → ${OUT_DIR}`)
  for (const file of readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort()) {
    console.log(`  ${file}`)
  }
}

let args: Args
try {
  args = parseArgs(Bun.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

try {
  await main(args)
} catch (error) {
  if (error instanceof SelectCancelled) process.exit(130)
  throw error
}

#!/usr/bin/env bun
/**
 * Store screenshot capture harness.
 *
 * Drives the real app — Release build, `EXPO_PUBLIC_SCREENSHOTS=1`, `EXPO_PUBLIC_E2E` unset — through
 * `e2e/flows/screenshots/*.yaml` and collects one PNG per panel. Data comes from two existing
 * mechanisms and no new native code: a database backup zip restored on startup (history, boards,
 * tunes, alerts) and a Debug Recording replayed at 1x through the real telemetry pipeline.
 *
 *   bun run screenshots               # all 8 panels on the pinned AVD
 *   bun run screenshots --panel 4     # one panel, fast iteration
 *   bun run screenshots --device R5CT # capture on an attached device instead of the AVD
 *
 * The hero panel is captured last, on purpose. `TelemetryPipeline.liveSeries` buckets the sparkline
 * over `liveHistoryLimit` minutes of *receipt* timestamps, so a full sparkline needs that much wall
 * clock at 1x; there is deliberately no playback-rate knob, because fast-forwarding would compress
 * the samples into a fraction of the window instead of filling it. The replay recording must be at
 * least as long as the whole run.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { applicationId } from '../src/config/appVariant.ts'

const ROOT = join(import.meta.dir, '..')
const FLOWS_DIR = join(ROOT, 'e2e', 'flows', 'screenshots')
const OUT_DIR = join(ROOT, 'screenshots', 'android')
const FIXTURE_ZIP = join(ROOT, 'shared', 'fixtures', 'screenshot-db.zip')

/** Mirrors `screenshotFixtureDir` in `src/config/screenshotMode.ts`. */
const DEVICE_FIXTURE_DIR = `/storage/emulated/0/Android/data/${applicationId}/files/screenshots`

/** Pinned so output does not depend on whatever AVD the developer happens to have. */
const AVD_NAME = 'Vescape_Screenshots'
const AVD_DEVICE = 'pixel_6' // 1080x2400
const AVD_IMAGE = 'system-images;android-35;google_apis;arm64-v8a'

const DEFAULT_REPLAY = 'replay-thor301'
/** `AppSettings.liveHistoryLimit` default — the sparkline window the hero panel has to fill. */
const DEFAULT_SPARKLINE_MINUTES = 5

interface Args {
  panel: number | null
  device: string | null
  replay: string
  sparklineMinutes: number
  build: boolean
  noWait: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    panel: null,
    device: null,
    replay: DEFAULT_REPLAY,
    sparklineMinutes: DEFAULT_SPARKLINE_MINUTES,
    build: false,
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
    else if (arg === '--build') args.build = true
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

async function attachedDevices(): Promise<string[]> {
  const out = await capture(['adb', 'devices'])
  return out
    .split('\n')
    .slice(1)
    .filter((line) => line.includes('\tdevice'))
    .map((line) => line.split('\t')[0].trim())
}

async function avdExists(): Promise<boolean> {
  const out = await capture(['emulator', '-list-avds'])
  return out.split('\n').some((line) => line.trim() === AVD_NAME)
}

async function createAvd(): Promise<void> {
  console.log(`› Creating AVD ${AVD_NAME} (${AVD_DEVICE}, 1080x2400)…`)
  const proc = Bun.spawn(
    ['avdmanager', 'create', 'avd', '-n', AVD_NAME, '-k', AVD_IMAGE, '-d', AVD_DEVICE, '--force'],
    { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' },
  )
  proc.stdin.write('no\n') // decline the custom hardware profile prompt
  proc.stdin.end()
  const code = await proc.exited
  if (code !== 0) {
    console.error(
      `Could not create ${AVD_NAME}. Install the system image first:\n` +
        `  sdkmanager "${AVD_IMAGE}"`,
    )
    process.exit(code ?? 1)
  }
}

/** Boots the pinned AVD and returns its serial. Reuses an already-running emulator. */
async function bootAvd(): Promise<string> {
  if (!(await avdExists())) await createAvd()

  const before = await attachedDevices()
  console.log(`› Booting ${AVD_NAME}…`)
  Bun.spawn(['emulator', '-avd', AVD_NAME, '-no-boot-anim', '-no-snapshot'], {
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
  console.error(`${AVD_NAME} did not finish booting within 180s.`)
  process.exit(1)
}

async function resolveDevice(args: Args): Promise<string> {
  if (args.device) return args.device
  const attached = await attachedDevices()
  if (attached.length === 1) return attached[0]
  if (attached.length > 1) {
    console.error(`Multiple devices attached: ${attached.join(', ')}. Pass --device <serial>.`)
    process.exit(1)
  }
  return bootAvd()
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

async function runFlow(file: string): Promise<void> {
  console.log(`› ${basename(file, '.yaml')}`)
  await runOrDie(['maestro', 'test', '-e', `APP_ID=${applicationId}`, join(FLOWS_DIR, file)])
}

async function main(args: Args): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const device = await resolveDevice(args)
  console.log(`Device: ${device}`)

  if (args.build || !(await installed(device))) await buildAndInstall(device)

  await pushFixtures(device, args.replay)
  await setChrome(device, true)

  try {
    const selected = selectPanels(args)
    // The hero shot needs a full sparkline window, so it always goes last; everything else is shot
    // while the replay is still filling it.
    const hero = selected.filter((file) => file.startsWith('01-'))
    const rest = selected.filter((file) => !file.startsWith('01-'))

    const bootedAt = Date.now()
    await runFlow('_boot.yaml')
    for (const file of rest) await runFlow(file)

    if (hero.length > 0 && !args.noWait) {
      const remainingMs = args.sparklineMinutes * 60_000 - (Date.now() - bootedAt)
      if (remainingMs > 0) {
        console.log(`› Waiting ${Math.ceil(remainingMs / 1000)}s for the sparkline window to fill…`)
        await Bun.sleep(remainingMs)
      }
    }
    for (const file of hero) await runFlow(file)
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

await main(args)

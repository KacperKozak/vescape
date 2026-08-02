/**
 * Platform contract for the store screenshot runner (`scripts/screenshots.ts`).
 *
 * The runner owns everything platform-agnostic — panel selection, flow order, the sparkline wait —
 * and a driver owns the parts that are genuinely different: how a device is picked and booted, how
 * a Release screenshot build is produced, how the fixture zip reaches the app, and how the status
 * bar is pinned. Both drivers drive the *same* flow files; a panel that needs different steps per
 * platform belongs in a sub-flow, not in a second flow set.
 */
import { existsSync } from 'fs'
import { basename, join } from 'path'

export type CapturePlatform = 'android' | 'ios'

export const ROOT = join(import.meta.dir, '..', '..')
export const FIXTURE_ZIP = join(ROOT, 'shared', 'fixtures', 'screenshot-db.zip')

export interface CaptureDriver {
  readonly platform: CapturePlatform
  /** Repo-relative output dir, handed to the flows as `OUT_DIR` for `takeScreenshot`. */
  readonly outDir: string
  /** What Maestro's `--device` takes: an adb serial or a simulator udid. */
  readonly deviceId: string
  /** Human label for the run header. */
  readonly deviceLabel: string
  /** Builds the Release `EXPO_PUBLIC_SCREENSHOTS=1` app and installs it on the resolved device. */
  buildAndInstall(): Promise<void>
  /** Fails the run when `--no-build` was passed and nothing is installed to reuse. */
  requireInstalled(): Promise<void>
  /** Clears app data and stages the fixture zip where the app's bootstrap reads it. */
  stageFixtures(): Promise<void>
  /** Pins (`clean`) or restores the status bar and any other run chrome. */
  setChrome(clean: boolean): Promise<void>
}

// ── process helpers ──────────────────────────────────────────────────────────

export async function capture(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(proc.stdout).text()
  await proc.exited
  return out
}

export async function runOrDie(
  cmd: string[],
  env?: Record<string, string | undefined>,
): Promise<void> {
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

/**
 * Build env for a screenshot build, identical on both platforms.
 *
 * `EXPO_PUBLIC_E2E` must stay unset: it reroutes board and telemetry reads to `e2eFake`, which
 * would leave the native replay session invisible to the UI. Fixture names are baked into the build
 * rather than read from a file at runtime — see `src/config/screenshotMode.ts`.
 */
export function screenshotBuildEnv(replay: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    EXPO_PUBLIC_SCREENSHOTS: '1',
    EXPO_PUBLIC_SCREENSHOTS_REPLAY: replay,
    EXPO_PUBLIC_SCREENSHOTS_DB: existsSync(FIXTURE_ZIP) ? basename(FIXTURE_ZIP) : '',
  }
  delete env.EXPO_PUBLIC_E2E
  return env
}

export function warnMissingFixture(): void {
  console.warn(`  no ${FIXTURE_ZIP} — capturing with replay telemetry only, history will be empty`)
}

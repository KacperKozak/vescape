import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(import.meta.dir, '..')
const CACHE_DIR = join(ROOT, '.expo', 'native-sync')

const PLATFORMS = ['ios', 'android'] as const
export type Platform = (typeof PLATFORMS)[number]

/**
 * Durable inputs that Expo prebuild turns into `ios/` and `android/`. Files or directories,
 * repo-relative. Anything generated (`ios/`, `android/`, Pods) is output, never input.
 */
const PREBUILD_INPUTS = ['app.config.ts', 'package.json', 'bun.lock', 'plugins', 'patches']

/** iOS-only prebuild inputs: `@bacons/apple-targets` copies these into the generated Xcode project. */
const IOS_PREBUILD_INPUTS = ['targets']

/** Per-Expo-module prebuild inputs: native registration and dependency declarations. */
const MODULE_PREBUILD_INPUTS = ['expo-module.config.json', 'package.json']

const IGNORED_ENTRIES = new Set(['.DS_Store', '.build', 'node_modules'])

/** Input key -> content hash (or, for `#layout` keys, a hash of the file path list). */
export type Fingerprint = Record<string, string>

export interface NativeState {
  prebuild: Fingerprint
  pods: Fingerprint
}

export interface Diff {
  added: string[]
  removed: string[]
  changed: string[]
}

export type SyncAction = 'prebuild' | 'pods' | 'none'

function hash(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function walk(absolute: string): string[] {
  if (!existsSync(absolute)) return []
  if (statSync(absolute).isFile()) return [absolute]

  return readdirSync(absolute)
    .filter((entry) => !IGNORED_ENTRIES.has(entry))
    .flatMap((entry) => walk(join(absolute, entry)))
    .sort()
}

function moduleDirs(root: string) {
  const modules = join(root, 'modules')
  if (!existsSync(modules)) return []
  return readdirSync(modules)
    .map((name) => join(modules, name))
    .filter((path) => statSync(path).isDirectory())
}

function hashFiles(paths: string[], root: string, into: Fingerprint) {
  for (const path of paths) {
    into[relative(root, path)] = hash(readFileSync(path))
  }
}

export function prebuildFingerprint(platform: Platform, root = ROOT): Fingerprint {
  const fingerprint: Fingerprint = {}
  const inputs = [...PREBUILD_INPUTS, ...(platform === 'ios' ? IOS_PREBUILD_INPUTS : [])]

  for (const input of inputs) {
    hashFiles(walk(join(root, input)), root, fingerprint)
  }

  for (const module of moduleDirs(root)) {
    const moduleInputs = MODULE_PREBUILD_INPUTS.map((name) => join(module, name)).filter((path) =>
      existsSync(path),
    )
    hashFiles(moduleInputs, root, fingerprint)
  }

  return fingerprint
}

/**
 * CocoaPods compiles whatever the podspec globbed at `pod install` time, so Pods go stale when the
 * *file list* under a module's `ios/` changes — a new Swift file is invisible to Xcode until Pods
 * are regenerated. Edits to already-compiled files are picked up by Xcode directly, so this hashes
 * the sorted path list, not file contents. Podspecs are hashed by content: they define the globs.
 */
export function podsFingerprint(root = ROOT): Fingerprint {
  const fingerprint: Fingerprint = {}

  for (const module of moduleDirs(root)) {
    const iosDir = join(module, 'ios')
    if (!existsSync(iosDir)) continue

    const files = walk(iosDir)
    hashFiles(
      files.filter((path) => path.endsWith('.podspec')),
      root,
      fingerprint,
    )

    const layout = files.map((path) => relative(root, path)).join('\n')
    fingerprint[`${relative(root, iosDir)}#layout`] = hash(layout)
  }

  return fingerprint
}

export function diffFingerprints(previous: Fingerprint, next: Fingerprint): Diff {
  const added = Object.keys(next).filter((key) => !(key in previous))
  const removed = Object.keys(previous).filter((key) => !(key in next))
  const changed = Object.keys(next).filter((key) => key in previous && previous[key] !== next[key])
  return { added, removed, changed }
}

function describe(diff: Diff) {
  return [
    ...diff.added.map((key) => `+ ${key}`),
    ...diff.removed.map((key) => `- ${key}`),
    ...diff.changed.map((key) => `~ ${key}`),
  ]
}

export function decideSync(input: {
  platform: Platform
  nativeDirExists: boolean
  podsDirExists: boolean
  cached: NativeState | null
  next: NativeState
}): { action: SyncAction; reasons: string[] } {
  const { platform, nativeDirExists, podsDirExists, cached, next } = input

  if (!nativeDirExists) return { action: 'prebuild', reasons: [`${platform}/ is missing`] }
  if (!cached) return { action: 'prebuild', reasons: ['no cached native fingerprint'] }

  const prebuild = describe(diffFingerprints(cached.prebuild, next.prebuild))
  if (prebuild.length > 0) return { action: 'prebuild', reasons: prebuild }

  if (platform === 'android') return { action: 'none', reasons: [] }

  if (!podsDirExists) return { action: 'pods', reasons: ['ios/Pods/ is missing'] }

  const pods = describe(diffFingerprints(cached.pods, next.pods))
  if (pods.length > 0) return { action: 'pods', reasons: pods }

  return { action: 'none', reasons: [] }
}

function readCache(platform: Platform): NativeState | null {
  const path = join(CACHE_DIR, `${platform}.json`)
  if (!existsSync(path)) return null

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as NativeState
  } catch {
    return null
  }
}

function writeCache(platform: Platform, state: NativeState) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(join(CACHE_DIR, `${platform}.json`), JSON.stringify(state, null, 2))
}

function readState(platform: Platform): NativeState {
  return { prebuild: prebuildFingerprint(platform), pods: podsFingerprint() }
}

function run(command: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  console.log(`\n> ${command.join(' ')}\n`)
  const result = Bun.spawnSync(command, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  })

  if (result.exitCode !== 0) {
    console.error(`\nnative-sync failed: ${command.join(' ')} exited with ${result.exitCode}`)
    process.exit(result.exitCode)
  }
}

function main() {
  const platform = process.argv[2] as Platform | undefined
  if (!platform || !PLATFORMS.includes(platform)) {
    console.error(`Usage: bun run scripts/native-sync.ts <${PLATFORMS.join('|')}>`)
    process.exit(1)
  }

  const { action, reasons } = decideSync({
    platform,
    nativeDirExists: existsSync(join(ROOT, platform)),
    podsDirExists: existsSync(join(ROOT, 'ios', 'Pods')),
    cached: readCache(platform),
    next: readState(platform),
  })

  if (action === 'none') {
    console.log(`native-sync ${platform}: up to date`)
    return
  }

  const intent =
    action === 'prebuild'
      ? 'expo prebuild regenerates the native project'
      : 'pod install refreshes the Pods project'

  console.log(`native-sync ${platform}: ${intent} because:`)
  for (const reason of reasons) {
    console.log(`  ${reason}`)
  }

  if (action === 'prebuild') {
    run(['bunx', 'expo', 'prebuild', '--platform', platform])
  }

  // Prebuild regenerates the Podfile but does not reliably install from it, so iOS always finishes
  // with `pod install` — a no-op when Pods already match. CocoaPods reads paths as ASCII-8BIT and
  // crashes on `unicode_normalize` unless the locale is UTF-8, which non-interactive shells often
  // lack; Expo's own CLI pins LANG for the same reason.
  if (platform === 'ios') {
    const lang = process.env.LANG ?? ''
    run(['pod', 'install'], {
      cwd: join(ROOT, 'ios'),
      env: { LANG: lang.toUpperCase().includes('UTF-8') ? lang : 'en_US.UTF-8' },
    })
  }

  // Fingerprint the post-sync tree: prebuild can rewrite its own inputs (lockfile, package.json).
  writeCache(platform, readState(platform))
  console.log(`\nnative-sync ${platform}: synced`)
}

if (import.meta.main) {
  main()
}

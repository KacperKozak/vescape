import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildReleaseNotes, validateReleaseMarkdown } from '../release-notes/bundler'
import { resolveEditorCommand } from '../release-notes/editor'

const ROOT = join(import.meta.dir, '../..')
const PACKAGE_PATH = join(ROOT, 'package.json')

export type VersionBump = 'major' | 'minor' | 'patch'

interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function command(program: string, args: string[], inherit = false): Promise<CommandResult> {
  const child = Bun.spawn([program, ...args], {
    cwd: ROOT,
    stdin: inherit ? 'inherit' : 'ignore',
    stdout: inherit ? 'inherit' : 'pipe',
    stderr: inherit ? 'inherit' : 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    inherit ? Promise.resolve('') : new Response(child.stdout).text(),
    inherit ? Promise.resolve('') : new Response(child.stderr).text(),
  ])
  return { exitCode, stdout: stdout.trimEnd(), stderr: stderr.trim() }
}

async function checked(program: string, args: string[], label: string): Promise<string> {
  const result = await command(program, args)
  if (result.exitCode !== 0) throw new Error(`${label}: ${result.stderr || result.stdout}`)
  return result.stdout
}

export function bumpMarketingVersion(version: string, bump: VersionBump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Cannot bump non-stable marketing version "${version}"`)
  const [, majorSource, minorSource, patchSource] = match
  const major = Number(majorSource)
  const minor = Number(minorSource)
  const patch = Number(patchSource)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function parsePorcelainPaths(status: string): string[] {
  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, ''))
}

interface ReleasePreparationStatus {
  baseVersion: string
  workingVersion: string
  changedPaths: readonly string[]
  noteExists: boolean
}

export function assertReleasePreparationStatus({
  baseVersion,
  workingVersion,
  changedPaths,
  noteExists,
}: ReleasePreparationStatus): void {
  if (changedPaths.length === 0) return
  const validNextVersions = new Set<VersionBump>(['major', 'minor', 'patch'])
  const isNextVersion = [...validNextVersions].some(
    (bump) => bumpMarketingVersion(baseVersion, bump) === workingVersion,
  )
  const notesPath = `release-notes/${workingVersion}.md`
  const expected = new Set(['package.json', notesPath])
  const isExactDraft =
    isNextVersion &&
    noteExists &&
    changedPaths.includes('package.json') &&
    changedPaths.every((path) => expected.has(path))
  if (!isExactDraft) {
    throw new Error('Commit or stash current changes before preparing a release version')
  }
}

export async function currentMarketingVersion(): Promise<string> {
  const pkg = JSON.parse(
    await checked('git', ['show', 'HEAD:package.json'], 'Cannot read current marketing version'),
  ) as { version?: unknown }
  if (typeof pkg.version !== 'string') throw new Error('package.json has no marketing version')
  bumpMarketingVersion(pkg.version, 'patch')
  return pkg.version
}

export async function verifyReleasePreparationReady(): Promise<void> {
  resolveEditorCommand()
  const branch = await checked('git', ['branch', '--show-current'], 'Cannot read current branch')
  if (branch !== 'dev')
    throw new Error(`Release preparation must run from dev, currently ${branch}`)
  const status = await checked('git', ['status', '--porcelain'], 'Cannot inspect working tree')
  const changedPaths = parsePorcelainPaths(status)
  const baseVersion = await currentMarketingVersion()
  const pkg = JSON.parse(await readFile(PACKAGE_PATH, 'utf8')) as { version?: unknown }
  if (typeof pkg.version !== 'string') throw new Error('package.json has no marketing version')
  assertReleasePreparationStatus({
    baseVersion,
    workingVersion: pkg.version,
    changedPaths,
    noteExists: await Bun.file(join(ROOT, `release-notes/${pkg.version}.md`)).exists(),
  })
}

export async function prepareReleaseCandidate(
  bump: VersionBump,
): Promise<{ marketingVersion: string; sourceSha: string }> {
  await verifyReleasePreparationReady()
  const initialStatus = await checked(
    'git',
    ['status', '--porcelain'],
    'Cannot inspect working tree',
  )
  const resumingDraft = parsePorcelainPaths(initialStatus).length > 0
  if (!resumingDraft) {
    await checked('git', ['pull', '--ff-only', 'origin', 'dev'], 'Cannot update dev')
    await verifyReleasePreparationReady()
    await checked('git', ['checkout', 'main'], 'Cannot switch to main')
    try {
      await checked('git', ['pull', '--ff-only', 'origin', 'main'], 'Cannot update main')
    } finally {
      await checked('git', ['checkout', 'dev'], 'Cannot switch back to dev')
    }
  }

  const originalPackage = await readFile(PACKAGE_PATH, 'utf8')
  const baseVersion = await currentMarketingVersion()
  const pkg = JSON.parse(originalPackage) as { version?: unknown }
  if (typeof pkg.version !== 'string') throw new Error('package.json has no marketing version')
  const marketingVersion = bumpMarketingVersion(baseVersion, bump)
  if (resumingDraft) {
    if (pkg.version !== marketingVersion) {
      throw new Error(
        `Existing release draft is v${pkg.version}; choose the matching version bump to resume it`,
      )
    }
  } else {
    pkg.version = marketingVersion
    await writeFile(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  const notesPath = `release-notes/${marketingVersion}.md`
  const notes = join(ROOT, notesPath)
  if (await Bun.file(notes).exists()) {
    validateReleaseMarkdown(await readFile(notes, 'utf8'), notesPath)
    await buildReleaseNotes()
    console.log(`\n✓ Using existing ${notesPath}`)
  } else {
    const author = await command(
      'bun',
      ['run', 'release-notes:author', `--version=${marketingVersion}`],
      true,
    )
    if (author.exitCode !== 0 || !(await Bun.file(notes).exists())) {
      if (!(await Bun.file(notes).exists())) await writeFile(PACKAGE_PATH, originalPackage)
      throw new Error(
        author.exitCode === 0
          ? 'Release notes were discarded; version change was rolled back'
          : `Release-note authoring exited with code ${author.exitCode}`,
      )
    }
  }

  const status = await checked('git', ['status', '--porcelain'], 'Cannot inspect release changes')
  const changedPaths = parsePorcelainPaths(status)
  const expected = new Set(['package.json', notesPath])
  const unexpected = changedPaths.filter((path) => !expected.has(path))
  if (unexpected.length > 0) {
    throw new Error(`Unexpected release changes: ${unexpected.join(', ')}`)
  }
  if (!changedPaths.includes('package.json') || !(await Bun.file(notes).exists())) {
    throw new Error('Release preparation did not produce a version and canonical notes')
  }

  await checked('git', ['add', 'package.json', notesPath], 'Cannot stage release candidate')
  await checked('git', ['commit', '-m', marketingVersion], 'Cannot commit release candidate')
  try {
    await checked('git', ['checkout', 'main'], 'Cannot switch to main')
    await checked(
      'git',
      ['merge', 'dev', '--no-ff', '-m', `release: ${marketingVersion}`],
      'Cannot merge dev into main',
    )
    await checked('git', ['checkout', 'dev'], 'Cannot switch back to dev')
    await checked('git', ['merge', '--ff-only', 'main'], 'Cannot align dev with main')
    await checked(
      'git',
      ['push', '--atomic', 'origin', 'dev', 'main'],
      'Cannot publish release candidate branches',
    )
  } catch (error) {
    const branch = await command('git', ['branch', '--show-current'])
    if (branch.stdout === 'main') {
      await command('git', ['merge', '--abort'])
      await command('git', ['checkout', 'dev'])
    }
    throw error
  }
  const sourceSha = (
    await checked('git', ['rev-parse', 'HEAD^{commit}'], 'Cannot resolve release candidate')
  ).toLowerCase()
  return { marketingVersion, sourceSha }
}

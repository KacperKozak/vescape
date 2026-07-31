import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
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

export async function currentMarketingVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(PACKAGE_PATH, 'utf8')) as { version?: unknown }
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
  if (status) throw new Error('Commit or stash current changes before preparing a release version')
}

export async function prepareReleaseCandidate(
  bump: VersionBump,
): Promise<{ marketingVersion: string; sourceSha: string }> {
  await verifyReleasePreparationReady()
  await checked('git', ['pull', '--ff-only', 'origin', 'dev'], 'Cannot update dev')
  await verifyReleasePreparationReady()
  await checked('git', ['checkout', 'main'], 'Cannot switch to main')
  try {
    await checked('git', ['pull', '--ff-only', 'origin', 'main'], 'Cannot update main')
  } finally {
    await checked('git', ['checkout', 'dev'], 'Cannot switch back to dev')
  }

  const originalPackage = await readFile(PACKAGE_PATH, 'utf8')
  const pkg = JSON.parse(originalPackage) as { version?: unknown }
  if (typeof pkg.version !== 'string') throw new Error('package.json has no marketing version')
  const marketingVersion = bumpMarketingVersion(pkg.version, bump)
  pkg.version = marketingVersion
  await writeFile(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`)

  const notesPath = `release-notes/${marketingVersion}.md`
  const notes = join(ROOT, notesPath)
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

  const status = await checked('git', ['status', '--porcelain'], 'Cannot inspect release changes')
  const changedPaths = status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, ''))
  const expected = new Set(['package.json', notesPath])
  const unexpected = changedPaths.filter((path) => !expected.has(path))
  if (unexpected.length > 0) {
    throw new Error(`Unexpected release changes: ${unexpected.join(', ')}`)
  }
  if (!changedPaths.includes('package.json') || !changedPaths.includes(notesPath)) {
    throw new Error('Release preparation did not produce both version and canonical notes')
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

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildReleaseNotes, validateReleaseMarkdown } from '../release-notes/bundler'
import { resolveEditorCommand } from '../release-notes/editor'
import { selectPrompt } from '../release-notes/prompt'
import { openEditor, reviewReleaseNoteDraft } from '../release-notes/review'

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
  const notesPath = releaseTrainNotesPath(workingVersion)
  const expected = new Set(['package.json', notesPath])
  const isExactDraft =
    isNextVersion &&
    changedPaths.includes('package.json') &&
    changedPaths.every((path) => expected.has(path)) &&
    (!changedPaths.includes(notesPath) || noteExists)
  if (!isExactDraft) {
    throw new Error('Commit or stash current changes before preparing a release version')
  }
}

export function releaseTrain(version: string): string {
  const match = /^(\d+)\.(\d+)\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(version)
  if (!match) throw new Error(`Cannot resolve release train for "${version}"`)
  return `${match[1]}.${match[2]}`
}

export function releaseTrainNotesPath(version: string): string {
  return `release-notes/${releaseTrain(version)}.md`
}

type TrainNotesChoice = 'draft' | 'skip' | 'keep' | 'edit' | 'reprompt'

interface TrainNotesDependencies {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  select(options: readonly TrainNotesChoice[]): Promise<TrainNotesChoice>
  author(train: string): Promise<void>
  edit(path: string): Promise<void>
  reprompt(path: string, commits: string): Promise<void>
  commits(path: string): Promise<string>
  validate(source: string, label: string): void
  build(): Promise<void>
  log(message: string): void
}

export async function prepareTrainNotes(
  bump: VersionBump,
  marketingVersion: string,
  dependencies: TrainNotesDependencies = trainNotesDependencies(),
): Promise<string> {
  const notesPath = releaseTrainNotesPath(marketingVersion)
  const notes = join(ROOT, notesPath)
  const exists = await dependencies.exists(notes)

  if (!exists) {
    dependencies.log(`\nNo canonical notes exist for train ${releaseTrain(marketingVersion)}.`)
    const choice = await dependencies.select(['draft', 'skip'])
    if (choice === 'draft') await dependencies.author(releaseTrain(marketingVersion))
    if (await dependencies.exists(notes)) {
      dependencies.validate(await dependencies.read(notes), notesPath)
      await dependencies.build()
    } else {
      dependencies.log(`✓ Skipping ${notesPath}; production promotion will require it`)
    }
    return notesPath
  }

  if (bump !== 'patch') {
    dependencies.validate(await dependencies.read(notes), notesPath)
    await dependencies.build()
    dependencies.log(`\n✓ Using existing ${notesPath}`)
    return notesPath
  }

  const commits = await dependencies.commits(notesPath)
  dependencies.log(`\nCommits since ${notesPath} was last modified:`)
  dependencies.log(commits || '  (none)')
  const choice = await dependencies.select(['keep', 'edit', 'reprompt'])
  if (choice === 'edit') await dependencies.edit(notes)
  if (choice === 'reprompt') await dependencies.reprompt(notes, commits)
  dependencies.validate(await dependencies.read(notes), notesPath)
  await dependencies.build()
  return notesPath
}

async function commitsSinceTrainNotes(notesPath: string): Promise<string> {
  const lastModified = await checked(
    'git',
    ['log', '-1', '--format=%H', '--', notesPath],
    `Cannot find history for ${notesPath}`,
  )
  if (!lastModified) return ''
  return checked(
    'git',
    ['log', '--oneline', `${lastModified}..HEAD`],
    `Cannot list commits since ${notesPath} changed`,
  )
}

function trainNotesDependencies(): TrainNotesDependencies {
  const editorCommand = resolveEditorCommand()
  return {
    exists: async (path) => Bun.file(path).exists(),
    read: (path) => readFile(path, 'utf8'),
    select: async (options) => {
      if (options.includes('draft')) {
        return selectPrompt('Prepare release-train notes', [
          { value: 'draft', label: 'Draft with Codex', shortcut: 'd' },
          { value: 'skip', label: 'Skip for now', shortcut: 's' },
        ] as const)
      }
      return selectPrompt('Update release-train notes', [
        { value: 'keep', label: 'Keep current notes', shortcut: 'k' },
        { value: 'edit', label: `Edit in ${editorCommand[0]}`, shortcut: 'e' },
        { value: 'reprompt', label: 'Re-prompt Codex with new commits', shortcut: 'r' },
      ] as const)
    },
    author: async (train) => {
      const author = await command(
        'bun',
        ['run', 'release-notes:author', `--version=${train}`],
        true,
      )
      if (author.exitCode !== 0) {
        throw new Error(`Release-note authoring exited with code ${author.exitCode}`)
      }
    },
    edit: (path) => openEditor(path, editorCommand),
    reprompt: async (path, commits) => {
      const current = await readFile(path, 'utf8')
      await reviewReleaseNoteDraft({
        root: ROOT,
        destination: path,
        label: path.slice(ROOT.length + 1),
        editorCommand,
        replace: true,
        initialPrompt: [
          'Update the current Vescape release-train notes with the new commits listed below.',
          'Read .agents/skills/release-notes/SKILL.md and follow its editorial policy exactly.',
          'Inspect the commits and relevant source before writing.',
          'Preserve important existing rider-visible outcomes; merge new outcomes into the right sections.',
          'Use only ## New, ## Improved, and ## Fixed, in that order, omitting empty sections.',
          'Do not modify the working tree. Return only the complete Markdown replacement.',
          `\nCurrent train notes:\n${current}`,
          `\nNew commits:\n${commits || '(none)'}`,
        ].join('\n'),
      })
    },
    commits: commitsSinceTrainNotes,
    validate: validateReleaseMarkdown,
    build: buildReleaseNotes,
    log: console.log,
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
    noteExists: await Bun.file(join(ROOT, releaseTrainNotesPath(pkg.version))).exists(),
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

  const notesPath = await prepareTrainNotes(bump, marketingVersion)

  const status = await checked('git', ['status', '--porcelain'], 'Cannot inspect release changes')
  const changedPaths = parsePorcelainPaths(status)
  const expected = new Set(['package.json', notesPath])
  const unexpected = changedPaths.filter((path) => !expected.has(path))
  if (unexpected.length > 0) {
    throw new Error(`Unexpected release changes: ${unexpected.join(', ')}`)
  }
  if (!changedPaths.includes('package.json')) {
    throw new Error('Release preparation did not produce a version change')
  }

  const pathsToStage = ['package.json']
  if (changedPaths.includes(notesPath)) pathsToStage.push(notesPath)
  await checked('git', ['add', ...pathsToStage], 'Cannot stage release candidate')
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

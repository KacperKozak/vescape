#!/usr/bin/env bun
import { $ } from 'bun'
import { join } from 'path'
import { androidVersionCode } from '../src/helpers/version'

const isPatch = process.argv.includes('--patch')
const root = import.meta.dir + '/..'

function bumpVersion(version: string, patch: boolean): string {
  const [major, minor, fix] = version.split('.').map(Number)
  if (patch) return `${major}.${minor}.${fix + 1}`
  return `${major}.${minor + 1}.0`
}

async function run(label: string, cmd: string) {
  console.log(`\n→ ${label}`)
  const result = await $`sh -c ${cmd}`.cwd(root).nothrow()
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed`)
  }
  console.log(`✓ ${label}`)
}

async function ensureCleanWorkingTree() {
  const status = await $`git status --porcelain`.cwd(root).text()
  if (status.trim().length > 0) {
    console.error('✗ Working tree is not clean. Commit or stash changes before release.')
    process.exit(1)
  }
  console.log('✓ Working tree is clean')
}

async function currentBranch(): Promise<string> {
  return (await $`git branch --show-current`.cwd(root).text()).trim()
}

async function branchSha(branch: string): Promise<string> {
  return (await $`git rev-parse ${branch}`.cwd(root).text()).trim()
}

async function rollbackLocalRelease(state: {
  originalBranch: string
  devSha: string
  mainSha: string
  releaseTag?: string
  published: boolean
}) {
  if (state.published) return

  if (state.releaseTag) {
    await $`git tag -d ${state.releaseTag}`.cwd(root).nothrow()
  }

  console.log('\n→ Rolling back local release changes')
  const mergeHead = join(root, '.git/MERGE_HEAD')
  if (await Bun.file(mergeHead).exists()) {
    await $`git merge --abort`.cwd(root).nothrow()
  }

  await $`git checkout dev`.cwd(root).nothrow()
  await $`git reset --hard ${state.devSha}`.cwd(root).nothrow()
  await $`git checkout main`.cwd(root).nothrow()
  await $`git reset --hard ${state.mainSha}`.cwd(root).nothrow()

  await $`git checkout ${state.originalBranch}`.cwd(root).nothrow()
  console.log('✓ Local release changes rolled back')
}

async function updateVersion(version: string) {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(await Bun.file(pkgPath).text())
  pkg.version = version
  await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

async function ensureOnlyExpectedChanges(expectedPaths: string[]) {
  const status = await $`git status --porcelain`.cwd(root).text()
  const changedPaths = status
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(2).trim())
    .map((path) => path.replace(/^.* -> /, ''))

  const unexpectedPaths = changedPaths.filter((path) => !expectedPaths.includes(path))
  if (unexpectedPaths.length > 0) {
    throw new Error(`Unexpected release changes:\n${unexpectedPaths.join('\n')}`)
  }
}

const branch = await currentBranch()
if (branch !== 'dev') {
  console.error(`✗ Release must run from "dev", currently on "${branch}"`)
  process.exit(1)
}
console.log('✓ On branch "dev"')

await ensureCleanWorkingTree()
await run('Pull latest', 'git pull --ff-only')

await run('Switch to main', 'git checkout main')
try {
  await run('Pull main', 'git pull --ff-only')
} finally {
  if ((await currentBranch()) !== 'dev') {
    await run('Switch back to dev', 'git checkout dev')
  }
}

const state = {
  originalBranch: branch,
  devSha: await branchSha('dev'),
  mainSha: await branchSha('main'),
  releaseTag: undefined as string | undefined,
  published: false,
}

try {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(await Bun.file(pkgPath).text())
  const baseVersion: string = pkg.version

  const newVersion = bumpVersion(baseVersion, isPatch)
  await updateVersion(newVersion)
  console.log(
    `\n→ Version bumped ${baseVersion} → ${newVersion} (Android versionCode ${androidVersionCode(newVersion)})`,
  )

  await ensureOnlyExpectedChanges(['package.json'])
  await run('Commit release version', `git add package.json && git commit -m "${newVersion}"`)
  await run('Switch to main', 'git checkout main')
  await run('Merge dev → main', `git merge dev --no-ff -m "release: ${newVersion}"`)
  state.releaseTag = `production-${newVersion}`
  await run('Tag production release', `git tag ${state.releaseTag}`)
  await run('Switch back to dev', 'git checkout dev')
  // Advance dev to the release merge commit so dev and main never drift.
  // Without this the merge commit lives only on main, their common base goes
  // stale, and the next version bump conflicts on package.json's version line.
  await run('Fast-forward dev to main', 'git merge --ff-only main')
  await run('Push dev, main and tag', `git push --atomic origin dev main ${state.releaseTag}`)
  state.published = true
  console.log(`\n✓ Release ${newVersion} complete`)
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  await rollbackLocalRelease(state)
  process.exit(1)
}

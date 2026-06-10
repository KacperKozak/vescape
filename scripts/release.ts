#!/usr/bin/env bun
import { $ } from 'bun'
import { join } from 'path'
import { homedir } from 'os'

const isPatch = process.argv.includes('--patch')
const root = import.meta.dir + '/..'

function bumpVersion(version: string, patch: boolean): string {
  const [major, minor, fix] = version.split('.').map(Number)
  if (patch) return `${major}.${minor}.${fix + 1}`
  return `${major}.${minor + 1}.0`
}

function versionCode(version: string): number {
  const [major, minor, fix] = version.split('.').map(Number)
  if (![major, minor, fix].every(Number.isInteger)) {
    throw new Error(`Invalid version "${version}"`)
  }
  return major * 10000 + minor * 100 + fix
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
  devSha?: string
  mainSha?: string
  branchSha?: string
  published: boolean
}) {
  if (state.published) return

  console.log('\n→ Rolling back local release changes')
  const mergeHead = join(root, '.git/MERGE_HEAD')
  if (await Bun.file(mergeHead).exists()) {
    await $`git merge --abort`.cwd(root).nothrow()
  }

  if (state.devSha) {
    await $`git checkout dev`.cwd(root).nothrow()
    await $`git reset --hard ${state.devSha}`.cwd(root).nothrow()
  }

  if (state.mainSha) {
    await $`git checkout main`.cwd(root).nothrow()
    await $`git reset --hard ${state.mainSha}`.cwd(root).nothrow()
  }

  if (!state.devSha && state.branchSha) {
    await $`git checkout ${state.originalBranch}`.cwd(root).nothrow()
    await $`git reset --hard ${state.branchSha}`.cwd(root).nothrow()
  }

  await $`git checkout ${state.originalBranch}`.cwd(root).nothrow()
  console.log('✓ Local release changes rolled back')
}

async function updateVersions(version: string) {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(await Bun.file(pkgPath).text())
  pkg.version = version
  await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  const gradlePath = join(root, 'android/app/build.gradle')
  const gradle = await Bun.file(gradlePath).text()
  if (!/versionCode \d+/.test(gradle) || !/versionName "[^"]+"/.test(gradle)) {
    throw new Error('Android version fields were not found')
  }

  const updatedGradle = gradle
    .replace(/versionCode \d+/, `versionCode ${versionCode(version)}`)
    .replace(/versionName "[^"]+"/, `versionName "${version}"`)

  await Bun.write(gradlePath, updatedGradle)
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

async function copyApk(apkLabel: string) {
  const apkSrc = join(root, 'android/app/build/outputs/apk/release/app-release.apk')
  const driveDir =
    Bun.env.RELEASE_APK_DIR ??
    join(homedir(), 'Library/CloudStorage/GoogleDrive-dexted.xt@gmail.com/My Drive/Apps')
  await $`mkdir -p ${driveDir}`
  const apkDest = join(driveDir, `vibe-wheel-${apkLabel}.apk`)
  await Bun.write(apkDest, Bun.file(apkSrc))
  console.log(`✓ Copied APK → ${apkDest}`)
}

const branch = await currentBranch()
const isDevBranch = branch === 'dev'

if (isDevBranch) {
  console.log('✓ On branch "dev" — full release')
} else {
  console.log(`→ On branch "${branch}" — branch build (no version bump, no merge)`)
}

await ensureCleanWorkingTree()
await run('Pull latest', 'git pull --ff-only')

if (isDevBranch) {
  await run('Switch to main', 'git checkout main')
  try {
    await run('Pull main', 'git pull --ff-only')
  } finally {
    if ((await currentBranch()) !== 'dev') {
      await run('Switch back to dev', 'git checkout dev')
    }
  }
}

const state = {
  originalBranch: branch,
  devSha: isDevBranch ? await branchSha('dev') : undefined,
  mainSha: isDevBranch ? await branchSha('main') : undefined,
  branchSha: isDevBranch ? undefined : await branchSha(branch),
  published: false,
}

try {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(await Bun.file(pkgPath).text())
  const baseVersion: string = pkg.version

  let apkLabel: string

  if (isDevBranch) {
    const newVersion = bumpVersion(baseVersion, isPatch)
    await updateVersions(newVersion)
    console.log(
      `\n→ Version bumped ${baseVersion} → ${newVersion} (Android versionCode ${versionCode(newVersion)})`,
    )
    apkLabel = `v${newVersion}`
  } else {
    const safeBranch = branch.replace(/[^a-zA-Z0-9._-]/g, '-')
    apkLabel = `v${baseVersion}-${safeBranch}`
  }

  await run('TypeScript check', 'bun run ts')
  await run('Lint', 'bun run lint')
  await run('Copy shared files', 'bun run copy:shared')
  await run('Tests', 'bun run test')
  await run('Build release APK', 'bun run build:release')
  await copyApk(apkLabel)

  if (isDevBranch) {
    await ensureOnlyExpectedChanges(['package.json'])
    await run(
      'Commit release version',
      `git add package.json && git commit -m "${apkLabel.slice(1)}"`,
    )
    await run('Switch to main', 'git checkout main')
    await run('Merge dev → main', `git merge dev --no-ff -m "release: ${apkLabel.slice(1)}"`)
    await run('Switch back to dev', 'git checkout dev')
    await run('Push dev and main', 'git push --atomic origin dev main')
    state.published = true
    console.log(`\n✓ Release ${apkLabel.slice(1)} complete`)
  } else {
    console.log(`\n✓ Branch build ${apkLabel} complete`)
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  await rollbackLocalRelease(state)
  process.exit(1)
}

#!/usr/bin/env bun
import { $ } from 'bun'
import { join } from 'path'

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
    console.error(`✗ ${label} failed`)
    process.exit(1)
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

await ensureCleanWorkingTree()
await run('Push unpushed commits', 'git push')
await run('TypeScript check', 'bun run ts')
await run('Tests', 'bun run test')
await run('Build release APK', 'bun run build:release')

// Bump version in package.json
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(await Bun.file(pkgPath).text())
const oldVersion: string = pkg.version
const newVersion = bumpVersion(oldVersion, isPatch)
pkg.version = newVersion
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`\n→ Version bumped ${oldVersion} → ${newVersion}`)

// Git commit
await run('Git commit', `git add package.json && git commit -m "${newVersion}"`)
await run('Push version commit', 'git push')

// Copy APK to Google Drive
const apkSrc = join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const driveDir =
  '/Users/kacperkozak/Library/CloudStorage/GoogleDrive-dexted.xt@gmail.com/My Drive/Apps'
await $`mkdir -p ${driveDir}`
const apkDest = join(driveDir, `vibe-wheel-v${newVersion}.apk`)
await Bun.write(apkDest, Bun.file(apkSrc))
console.log(`✓ Copied APK → ${apkDest}`)

console.log(`\n✓ Release ${newVersion} complete`)

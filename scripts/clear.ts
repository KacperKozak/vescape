import { readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const ROOT = join(import.meta.dir, '..')

const projectCaches = [
  '.expo',
  'android/.gradle',
  'android/build',
  'android/app/build',
  'node_modules/.cache',
]

const temporaryCachePrefixes = ['metro-', 'haste-map-', 'react-', 'hermes-']
const temporaryCacheNames = new Set(['metro-cache'])

function remove(path: string) {
  rmSync(path, { force: true, recursive: true })
  console.log(`removed ${path}`)
}

function run(command: string[]) {
  console.log(`\n> ${command.join(' ')}`)
  const result = Bun.spawnSync(command, {
    cwd: ROOT,
    env: process.env,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  })

  if (result.exitCode !== 0) {
    process.exit(result.exitCode)
  }
}

console.log('Clearing project caches...')
for (const path of projectCaches) {
  remove(join(ROOT, path))
}

console.log('\nClearing temporary Metro and Hermes caches...')
for (const name of readdirSync(tmpdir())) {
  if (
    temporaryCacheNames.has(name) ||
    temporaryCachePrefixes.some((prefix) => name.startsWith(prefix))
  ) {
    remove(join(tmpdir(), name))
  }
}

run(['./android/gradlew', '-p', 'android', '--stop'])
run(['./android/gradlew', '-p', 'android', 'clean'])

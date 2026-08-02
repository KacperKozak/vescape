#!/usr/bin/env bun
import { readFileSync } from 'node:fs'
import { sentryNativeInitProblems } from './productionConfig.ts'

const [manifestPath] = process.argv.slice(2)

if (!manifestPath) {
  console.error('Usage: verifySentryNativeInit.ts <merged-AndroidManifest.xml>')
  process.exit(1)
}

const problems = sentryNativeInitProblems(readFileSync(manifestPath, 'utf8'))

if (problems.length > 0) {
  console.error(
    `Release artifact would ship without native Sentry init (${manifestPath}):\n${problems
      .map((problem) => `  - ${problem}`)
      .join('\n')}`,
  )
  process.exit(1)
}

console.log('Merged manifest starts Sentry natively before JS (auto-init=true, DSN, production).')

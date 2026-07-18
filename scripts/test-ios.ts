const DEFAULT_DESTINATION = 'platform=iOS Simulator,name=iPhone 17'
const TEST_TIMEOUT_MS = Number(process.env.IOS_TEST_TIMEOUT_MS ?? 120_000)
const destination = process.env.IOS_TEST_DESTINATION ?? DEFAULT_DESTINATION
const resultBundle = `/tmp/vesc-ios-tests-${Date.now()}.xcresult`

const args = [
  'test',
  '-scheme',
  'VescapeCore',
  '-destination',
  destination,
  '-resultBundlePath',
  resultBundle,
  '-quiet',
]

const decoder = new TextDecoder()
const proc = Bun.spawn(['xcodebuild', ...args], {
  cwd: 'modules/vescape-core',
  stdout: 'pipe',
  stderr: 'pipe',
})

let output = ''
const timeout = setTimeout(() => {
  proc.kill('SIGTERM')
}, TEST_TIMEOUT_MS)

async function collect(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return
  for await (const chunk of stream) {
    output += decoder.decode(chunk)
  }
}

await Promise.all([collect(proc.stdout), collect(proc.stderr)])
const exitCode = await proc.exited
clearTimeout(timeout)

const lines = output
  .split('\n')
  .map((line) => line.trimEnd())
  .filter(Boolean)

const failures = lines.filter((line) => {
  const lower = line.toLowerCase()
  return (
    lower.includes('error:') ||
    lower.includes('failed') ||
    lower.includes('testing cancelled') ||
    lower.includes('test suite') ||
    lower.includes('test case')
  )
})

if (exitCode === 0) {
  const summary = [...lines]
    .reverse()
    .find((line) => line.includes('Executed ') && line.includes(' tests'))
  console.log(summary ?? 'iOS tests passed.')
  process.exit(0)
}

console.error(`iOS tests failed. Result bundle: ${resultBundle}`)
console.error('')

const useful = failures.length > 0 ? failures : lines.slice(-80)
console.error(useful.slice(-120).join('\n'))
process.exit(exitCode || 1)

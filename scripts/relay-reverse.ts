/**
 * Tunnels the device's `localhost:<port>` to this machine when `EXPO_PUBLIC_SERVER_URL`
 * points at a local Vescape server (../vescape-server). No-op for a remote server, so it is
 * safe to run unconditionally before `expo run:android`.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

function localPort(serverUrl: string | undefined): number | null {
  if (!serverUrl) return null
  let url: URL
  try {
    url = new URL(serverUrl)
  } catch {
    return null
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return null
  return Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
}

async function adb(...args: string[]): Promise<string> {
  const proc = Bun.spawn(['adb', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  if (code !== 0)
    throw new Error(`adb ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`)
  return out
}

async function connectedDevices(): Promise<string[]> {
  return (await adb('devices'))
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([, state]) => state?.trim() === 'device')
    .map(([serial]) => serial!)
}

const port = localPort(process.env.EXPO_PUBLIC_SERVER_URL)
if (port === null) process.exit(0)

let devices: string[]
try {
  devices = await connectedDevices()
} catch (error) {
  console.warn(`Skipping relay reverse: ${error instanceof Error ? error.message : error}`)
  process.exit(0)
}

for (const serial of devices) {
  await adb('-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`)
  console.log(`Reversed ${serial} localhost:${port} -> host:${port}`)
}

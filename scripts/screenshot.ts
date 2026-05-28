#!/usr/bin/env bun

import { $ } from 'bun'
import { tmpdir } from 'os'
import { join } from 'path'

const devicesOutput = await $`adb devices`.text()
const deviceId = devicesOutput
  .split('\n')
  .slice(1)
  .find((line) => line.includes('\tdevice'))
  ?.split('\t')[0]
  ?.trim()

if (!deviceId) {
  console.error('No adb device found')
  process.exit(1)
}

console.log(`Device: ${deviceId}`)

const remotePath = '/sdcard/screenshot_tmp.png'
const localPath = join(tmpdir(), `adb_screenshot_${Date.now()}.png`)

await $`adb -s ${deviceId} shell screencap -p ${remotePath}`
await $`adb -s ${deviceId} pull ${remotePath} ${localPath}`
await $`adb -s ${deviceId} shell rm ${remotePath}`

await $`osascript -e ${'set the clipboard to (read (POSIX file "' + localPath + '") as «class PNGf»)'}`

console.log(`Copied to clipboard`)

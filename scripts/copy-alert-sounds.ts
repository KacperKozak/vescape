import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { extname, join, parse } from 'path'

const SOURCE_DIR = join(import.meta.dir, '..', 'modules', 'vesc-ble', 'sounds')
const ANDROID_RAW_DIR = join(
  import.meta.dir,
  '..',
  'modules',
  'vesc-ble',
  'android',
  'src',
  'main',
  'res',
  'raw',
)
const SUPPORTED_EXTENSIONS = new Set(['.ogg', '.wav'])

mkdirSync(ANDROID_RAW_DIR, { recursive: true })

let copied = 0
for (const file of readdirSync(SOURCE_DIR)) {
  const ext = extname(file)
  if (!SUPPORTED_EXTENSIONS.has(ext)) continue
  const outputName = `${parse(file).name}${ext}`.toLowerCase().replace(/[^a-z0-9_.]/g, '_')
  copyFileSync(join(SOURCE_DIR, file), join(ANDROID_RAW_DIR, outputName))
  copied += 1
  console.log(`${file} -> ${outputName}`)
}

if (copied === 0) {
  throw new Error(`No alert sound files found in ${SOURCE_DIR}`)
}

console.log(`Copied ${copied} alert sound file(s) to ${ANDROID_RAW_DIR}`)

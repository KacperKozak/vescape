import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { extname, join, parse, relative } from 'path'

const ROOT = join(import.meta.dir, '..')
const ANDROID_SRC = join(ROOT, 'modules', 'vesc-ble', 'android', 'src')

const targets = [
  {
    src: join(ROOT, 'shared', 'alerts'),
    dest: join(ANDROID_SRC, 'main', 'res', 'raw'),
    extensions: new Set(['.ogg', '.wav']),
    rename: (file: string) =>
      `${parse(file).name}${extname(file)}`.toLowerCase().replace(/[^a-z0-9_.]/g, '_'),
  },
  {
    src: join(ROOT, 'shared', 'data'),
    dest: join(ANDROID_SRC, 'main', 'assets', 'data'),
    extensions: new Set(['.json']),
    rename: (file: string) => file,
  },
  {
    src: join(ROOT, 'shared', 'data'),
    dest: join(ANDROID_SRC, 'test', 'resources', 'data'),
    extensions: new Set(['.json']),
    rename: (file: string) => file,
  },
]

let totalCopied = 0

for (const { src, dest, extensions, rename } of targets) {
  mkdirSync(dest, { recursive: true })

  const relSrc = relative(ROOT, src)
  const relDest = relative(ROOT, dest)
  console.log(`\n  ${relSrc} → ${relDest}`)

  for (const file of readdirSync(src)) {
    if (!extensions.has(extname(file))) continue
    const outputName = rename(file)
    copyFileSync(join(src, file), join(dest, outputName))
    const renamed = outputName !== file ? ` (→ ${outputName})` : ''
    console.log(`    ✓ ${file}${renamed}`)
    totalCopied += 1
  }
}

if (totalCopied === 0) {
  throw new Error('No shared files found to copy')
}

console.log(`\n✓ ${totalCopied} file${totalCopied !== 1 ? 's' : ''} copied`)

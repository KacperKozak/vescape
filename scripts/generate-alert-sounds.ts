import { writeFileSync } from 'fs'
import { join } from 'path'

const SAMPLE_RATE = 44100
const SOUNDS_DIR = join(import.meta.dir, '..', 'modules', 'vesc-ble', 'sounds')

function generateSineWave(
  frequency: number,
  durationMs: number,
  volume: number = 0.8,
  fadeMs: number = 5,
): Float64Array {
  const samples = Math.floor((SAMPLE_RATE * durationMs) / 1000)
  const fadeSamples = Math.floor((SAMPLE_RATE * fadeMs) / 1000)
  const buf = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    let amp = volume
    if (i < fadeSamples) amp *= i / fadeSamples
    if (i > samples - fadeSamples) amp *= (samples - i) / fadeSamples
    buf[i] = amp * Math.sin(2 * Math.PI * frequency * (i / SAMPLE_RATE))
  }
  return buf
}

function mixSines(
  specs: { frequency: number; volume: number }[],
  durationMs: number,
  fadeMs: number = 5,
): Float64Array {
  const samples = Math.floor((SAMPLE_RATE * durationMs) / 1000)
  const buf = new Float64Array(samples)
  for (const spec of specs) {
    const wave = generateSineWave(spec.frequency, durationMs, spec.volume, fadeMs)
    for (let i = 0; i < samples; i++) buf[i] += wave[i]
  }
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  if (peak > 1) for (let i = 0; i < samples; i++) buf[i] /= peak
  return buf
}

function floatTo16BitPCM(samples: Float64Array): Buffer {
  const buf = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const val = s < 0 ? s * 0x8000 : s * 0x7fff
    buf.writeInt16LE(Math.round(val), i * 2)
  }
  return buf
}

function writeWav(filename: string, samples: Float64Array) {
  const pcm = floatTo16BitPCM(samples)
  const header = Buffer.alloc(44)

  const dataSize = pcm.length
  const fileSize = 36 + dataSize

  header.write('RIFF', 0)
  header.writeUInt32LE(fileSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  const path = join(SOUNDS_DIR, filename)
  writeFileSync(path, Buffer.concat([header, pcm]))
  console.log(
    `  ${filename} (${(pcm.length / 1024).toFixed(1)} KB, ${((samples.length / SAMPLE_RATE) * 1000).toFixed(0)}ms)`,
  )
}

console.log('Generating alert sounds...\n')

// --- Single category ---

// beep: clean 880Hz tone, 200ms
writeWav('alert_beep.wav', generateSineWave(880, 200, 0.7, 10))

// urgent: harsh dual-tone, 150ms
writeWav(
  'alert_urgent.wav',
  mixSines(
    [
      { frequency: 880, volume: 0.6 },
      { frequency: 1320, volume: 0.5 },
    ],
    150,
    8,
  ),
)

// notify: soft high ping, 180ms
writeWav('alert_notify.wav', generateSineWave(1200, 180, 0.5, 15))

// --- Geiger category ---

// tick: very short click, 40ms
writeWav(
  'alert_tick.wav',
  mixSines(
    [
      { frequency: 1000, volume: 0.8 },
      { frequency: 2500, volume: 0.3 },
    ],
    40,
    3,
  ),
)

// tick_hard: sharper click, 35ms
writeWav(
  'alert_tick_hard.wav',
  mixSines(
    [
      { frequency: 1400, volume: 0.7 },
      { frequency: 3000, volume: 0.4 },
    ],
    35,
    2,
  ),
)

// sustained: tone for geiger at depth 1.0, 500ms (will be looped)
writeWav(
  'alert_sustained.wav',
  mixSines(
    [
      { frequency: 880, volume: 0.6 },
      { frequency: 1100, volume: 0.4 },
    ],
    500,
    20,
  ),
)

console.log('\nDone! Files in modules/vesc-ble/sounds/')
console.log(
  'Convert to OGG with: for f in modules/vesc-ble/sounds/*.wav; do ffmpeg -i "$f" "${f%.wav}.ogg"; done',
)

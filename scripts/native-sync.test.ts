import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { decideSync, podsFingerprint, prebuildFingerprint } from './native-sync.ts'
import type { NativeState } from './native-sync.ts'

let root: string

function write(relativePath: string, contents: string) {
  const path = join(root, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, contents)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'native-sync-'))
  write('app.config.ts', 'export default {}')
  write('package.json', '{}')
  write('modules/vesc-ble/expo-module.config.json', '{}')
  write('modules/vesc-ble/ios/VescBle.podspec', 'spec')
  write('modules/vesc-ble/ios/VescBleModule.swift', 'class VescBleModule {}')
})

afterEach(() => {
  rmSync(root, { force: true, recursive: true })
})

describe('podsFingerprint', () => {
  it('ignores edits to existing Swift files', () => {
    const before = podsFingerprint(root)
    write('modules/vesc-ble/ios/VescBleModule.swift', 'class VescBleModule { func added() {} }')

    expect(podsFingerprint(root)).toEqual(before)
  })

  it('changes when a Swift file is added, because Pods compile a globbed file list', () => {
    const before = podsFingerprint(root)
    write('modules/vesc-ble/ios/BoardPhase.swift', 'enum BoardPhase {}')

    expect(podsFingerprint(root)).not.toEqual(before)
  })

  it('changes when a bundled resource is added', () => {
    const before = podsFingerprint(root)
    write('modules/vesc-ble/ios/alerts/beep.wav', 'wav')

    expect(podsFingerprint(root)).not.toEqual(before)
  })

  it('changes when the podspec changes', () => {
    const before = podsFingerprint(root)
    write('modules/vesc-ble/ios/VescBle.podspec', 'spec with new dependency')

    expect(podsFingerprint(root)).not.toEqual(before)
  })
})

describe('prebuildFingerprint', () => {
  it('changes when a config plugin is added', () => {
    const before = prebuildFingerprint('android', root)
    write('plugins/withThing.ts', 'export default {}')

    expect(prebuildFingerprint('android', root)).not.toEqual(before)
  })

  it('changes when Expo module native registration changes', () => {
    const before = prebuildFingerprint('ios', root)
    write('modules/vesc-ble/expo-module.config.json', '{"platforms":["ios"]}')

    expect(prebuildFingerprint('ios', root)).not.toEqual(before)
  })

  it('tracks apple-targets sources on iOS only', () => {
    const androidBefore = prebuildFingerprint('android', root)
    const iosBefore = prebuildFingerprint('ios', root)
    write('targets/ride-activity/expo-target.config.js', 'module.exports = {}')

    expect(prebuildFingerprint('android', root)).toEqual(androidBefore)
    expect(prebuildFingerprint('ios', root)).not.toEqual(iosBefore)
  })

  it('ignores Swift edits, which prebuild does not regenerate', () => {
    const before = prebuildFingerprint('ios', root)
    write('modules/vesc-ble/ios/BoardPhase.swift', 'enum BoardPhase {}')

    expect(prebuildFingerprint('ios', root)).toEqual(before)
  })
})

describe('decideSync', () => {
  const state = (): NativeState => ({
    prebuild: prebuildFingerprint('ios', root),
    pods: podsFingerprint(root),
  })

  const synced = () => ({
    platform: 'ios' as const,
    nativeDirExists: true,
    podsDirExists: true,
    cached: state(),
    next: state(),
  })

  it('does nothing when fingerprints match', () => {
    expect(decideSync(synced())).toEqual({ action: 'none', reasons: [] })
  })

  it('prebuilds when the native folder is missing', () => {
    const { action, reasons } = decideSync({ ...synced(), nativeDirExists: false })

    expect(action).toBe('prebuild')
    expect(reasons).toEqual(['ios/ is missing'])
  })

  it('prebuilds when no fingerprint was ever cached', () => {
    const { action, reasons } = decideSync({ ...synced(), cached: null })

    expect(action).toBe('prebuild')
    expect(reasons).toEqual(['no cached native fingerprint'])
  })

  it('names the changed prebuild inputs', () => {
    const cached = state()
    write('app.config.ts', 'export default { name: "vescape" }')
    write('plugins/withThing.ts', 'export default {}')

    const { action, reasons } = decideSync({ ...synced(), cached, next: state() })

    expect(action).toBe('prebuild')
    expect(reasons).toEqual(['+ plugins/withThing.ts', '~ app.config.ts'])
  })

  it('prefers prebuild over pod install when both scopes drifted', () => {
    const cached = state()
    write('app.config.ts', 'export default { name: "vescape" }')
    write('modules/vesc-ble/ios/BoardPhase.swift', 'enum BoardPhase {}')

    expect(decideSync({ ...synced(), cached, next: state() }).action).toBe('prebuild')
  })

  it('installs pods when the module Swift file list changed', () => {
    const cached = state()
    write('modules/vesc-ble/ios/BoardPhase.swift', 'enum BoardPhase {}')

    const { action, reasons } = decideSync({ ...synced(), cached, next: state() })

    expect(action).toBe('pods')
    expect(reasons).toEqual(['~ modules/vesc-ble/ios#layout'])
  })

  it('installs pods when Pods/ is missing', () => {
    const { action, reasons } = decideSync({ ...synced(), podsDirExists: false })

    expect(action).toBe('pods')
    expect(reasons).toEqual(['ios/Pods/ is missing'])
  })

  it('never installs pods for android', () => {
    const cached = state()
    write('modules/vesc-ble/ios/BoardPhase.swift', 'enum BoardPhase {}')

    const decision = decideSync({
      ...synced(),
      platform: 'android',
      podsDirExists: false,
      cached,
      next: state(),
    })

    expect(decision).toEqual({ action: 'none', reasons: [] })
  })
})

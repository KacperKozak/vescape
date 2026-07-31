import { describe, expect, test } from 'bun:test'
import { bumpMarketingVersion } from './prepare'

describe('release candidate version bump', () => {
  test('calculates explicit major, minor, and patch versions', () => {
    expect(bumpMarketingVersion('0.83.1', 'major')).toBe('1.0.0')
    expect(bumpMarketingVersion('0.83.1', 'minor')).toBe('0.84.0')
    expect(bumpMarketingVersion('0.83.1', 'patch')).toBe('0.83.2')
  })

  test('refuses prerelease and malformed versions', () => {
    expect(() => bumpMarketingVersion('0.83.1-beta.1', 'patch')).toThrow('non-stable')
    expect(() => bumpMarketingVersion('83.1', 'minor')).toThrow('non-stable')
  })
})

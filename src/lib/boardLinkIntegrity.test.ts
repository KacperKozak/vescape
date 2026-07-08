import { expect, test } from 'bun:test'

import type { LinkIntegrity } from 'vesc-ble'

import { canRunFirmwareCommand, getConnectedLinkIntegrityWarning } from './boardLinkIntegrity'

test.each([
  ['unknown', false],
  ['checking', false],
  ['trusted', true],
  ['outdated', false],
  ['mismatched', false],
] as [LinkIntegrity, boolean][])('canRunFirmwareCommand(%s) is %s', (linkIntegrity, expected) => {
  expect(canRunFirmwareCommand(linkIntegrity)).toBe(expected)
})

test('connected outdated links show re-link warning copy', () => {
  expect(getConnectedLinkIntegrityWarning('connected', 'outdated')).toEqual({
    text: 'Board link needs update',
    buttonText: 'Re-link',
    severity: 'warning',
  })
})

test('connected mismatched links show distinct re-link error copy', () => {
  expect(getConnectedLinkIntegrityWarning('connected', 'mismatched')).toEqual({
    text: 'Board hardware or firmware changed',
    buttonText: 'Re-link',
    severity: 'error',
  })
})

test('telemetry stale stays separate from link integrity warnings', () => {
  expect(getConnectedLinkIntegrityWarning('stale', 'mismatched')).toBeNull()
})

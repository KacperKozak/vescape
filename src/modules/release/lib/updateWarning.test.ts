import { describe, expect, test } from 'bun:test'
import type { AppStatus, AppVersionStatus } from 'vescape-core'

import { shouldShowUpdateWarning, updateWarningMessage } from './updateWarning'

const FALLBACK = 'default warning'

function status(version: AppVersionStatus, message: string | null = null): AppStatus {
  return {
    version: { installed: '0.70.0', latest: '0.80.2', status: version, message },
    messages: [],
  }
}

function state(over: Partial<{ status: AppStatus | null; updateWarningDismissed: boolean }>) {
  return { status: null, updateWarningDismissed: false, ...over }
}

describe('shouldShowUpdateWarning', () => {
  test('shows an undismissed update warning', () => {
    expect(shouldShowUpdateWarning(state({ status: status('update-warning') }))).toBe(true)
  })

  test('hides once dismissed for the cold launch', () => {
    expect(
      shouldShowUpdateWarning(
        state({ status: status('update-warning'), updateWarningDismissed: true }),
      ),
    ).toBe(false)
  })

  test('never shows for non-warning statuses', () => {
    for (const version of ['current', 'online-blocked', 'app-blocked'] as const) {
      expect(shouldShowUpdateWarning(state({ status: status(version) }))).toBe(false)
    }
  })

  test('never shows while App Status is unknown (fail-open)', () => {
    expect(shouldShowUpdateWarning(state({ status: null }))).toBe(false)
  })
})

describe('updateWarningMessage', () => {
  test('uses the server message when present', () => {
    expect(
      updateWarningMessage(state({ status: status('update-warning', '# Update') }), FALLBACK),
    ).toBe('# Update')
  })

  test('falls back to the bundled default when the rule carries none', () => {
    expect(updateWarningMessage(state({ status: status('update-warning') }), FALLBACK)).toBe(
      FALLBACK,
    )
  })

  test('returns null when there is nothing to show', () => {
    expect(updateWarningMessage(state({ status: status('current') }), FALLBACK)).toBeNull()
    expect(
      updateWarningMessage(
        state({ status: status('update-warning'), updateWarningDismissed: true }),
        FALLBACK,
      ),
    ).toBeNull()
  })
})

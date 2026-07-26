import { describe, expect, test } from 'bun:test'
import type { AppStatus, AppVersionStatus, CommunityMessage } from 'vescape-core'

import { DEFAULT_APP_BLOCK_MESSAGE } from '@/modules/release/constants/appBlock'
import { DEFAULT_ONLINE_BLOCK_MESSAGE } from '@/modules/release/constants/onlineBlock'
import { DEFAULT_UPDATE_WARNING_MESSAGE } from '@/modules/release/constants/updateWarning'
import {
  selectReleaseSurface,
  type ReleaseSurfaceInputs,
} from '@/modules/release/lib/releaseSurface'

function message(overrides: Partial<CommunityMessage> & { id: string }): CommunityMessage {
  return { type: 'info', title: null, body: 'body', action: null, ...overrides }
}

function status(
  version: AppVersionStatus,
  over: { message?: string | null; messages?: CommunityMessage[] } = {},
): AppStatus {
  return {
    version: {
      installed: '0.70.0',
      latest: '0.80.2',
      status: version,
      message: over.message ?? null,
    },
    messages: over.messages ?? [],
  }
}

function inputs(over: Partial<ReleaseSurfaceInputs> = {}): ReleaseSurfaceInputs {
  return {
    status: null,
    versionNoticeDismissed: false,
    dismissedCommunityMessageIds: [],
    ...over,
  }
}

describe('selectReleaseSurface', () => {
  test('shows nothing while App Status is unknown (fail-open)', () => {
    expect(selectReleaseSurface(inputs())).toBeNull()
  })

  test('shows nothing for a current version with no messages', () => {
    expect(selectReleaseSurface(inputs({ status: status('current') }))).toBeNull()
  })

  test('an app block outranks a pending Community Message', () => {
    const surface = selectReleaseSurface(
      inputs({ status: status('app-blocked', { messages: [message({ id: 'a' })] }) }),
    )
    expect(surface).toEqual({
      kind: 'app-block',
      message: DEFAULT_APP_BLOCK_MESSAGE,
      installedVersion: '0.70.0',
      latestVersion: '0.80.2',
    })
  })

  test('an update warning outranks a pending Community Message', () => {
    const surface = selectReleaseSurface(
      inputs({ status: status('update-warning', { messages: [message({ id: 'a' })] }) }),
    )
    expect(surface).toEqual({ kind: 'update-warning', message: DEFAULT_UPDATE_WARNING_MESSAGE })
  })

  test('a dismissed update warning lets the Community Message through', () => {
    const surface = selectReleaseSurface(
      inputs({
        status: status('update-warning', { messages: [message({ id: 'a' })] }),
        versionNoticeDismissed: true,
      }),
    )
    expect(surface).toEqual({ kind: 'community-message', message: message({ id: 'a' }) })
  })

  test('an app block ignores the version-notice dismissal', () => {
    const surface = selectReleaseSurface(
      inputs({ status: status('app-blocked'), versionNoticeDismissed: true }),
    )
    expect(surface?.kind).toBe('app-block')
  })

  test('online-blocked shows the Online Block notice, outranking a Community Message', () => {
    const surface = selectReleaseSurface(
      inputs({ status: status('online-blocked', { messages: [message({ id: 'a' })] }) }),
    )
    expect(surface).toEqual({ kind: 'online-block', message: DEFAULT_ONLINE_BLOCK_MESSAGE })
  })

  test('a dismissed Online Block notice lets the Community Message through', () => {
    const surface = selectReleaseSurface(
      inputs({
        status: status('online-blocked', { messages: [message({ id: 'a' })] }),
        versionNoticeDismissed: true,
      }),
    )
    expect(surface).toEqual({ kind: 'community-message', message: message({ id: 'a' }) })
  })

  test('uses the server message over the bundled default', () => {
    expect(
      selectReleaseSurface(inputs({ status: status('app-blocked', { message: '# Stop' }) })),
    ).toEqual({
      kind: 'app-block',
      message: '# Stop',
      installedVersion: '0.70.0',
      latestVersion: '0.80.2',
    })
    expect(
      selectReleaseSurface(inputs({ status: status('update-warning', { message: '# Soon' }) })),
    ).toEqual({ kind: 'update-warning', message: '# Soon' })
  })

  test('presents the highest-priority unacknowledged Community Message', () => {
    const surface = selectReleaseSurface(
      inputs({
        status: status('current', {
          messages: [message({ id: 'a' }), message({ id: 'b', type: 'critical' })],
        }),
      }),
    )
    expect(surface).toEqual({
      kind: 'community-message',
      message: message({ id: 'b', type: 'critical' }),
    })
  })

  test('shows nothing once every Community Message is acknowledged', () => {
    const surface = selectReleaseSurface(
      inputs({
        status: status('current', { messages: [message({ id: 'a' })] }),
        dismissedCommunityMessageIds: ['a'],
      }),
    )
    expect(surface).toBeNull()
  })
})

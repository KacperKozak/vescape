import { describe, expect, test } from 'bun:test'

import type { CommunityMessage } from 'vescape-core'
import {
  acknowledgeCommunityMessage,
  communityMessageQueue,
  currentCommunityMessage,
} from '@/modules/release/lib/communityMessages'

function message(overrides: Partial<CommunityMessage> & { id: string }): CommunityMessage {
  return {
    type: 'info',
    body: 'body',
    action: null,
    ...overrides,
  }
}

describe('communityMessageQueue', () => {
  test('is empty when there are no messages', () => {
    expect(communityMessageQueue([], [])).toEqual([])
  })

  test('orders critical before warning before info', () => {
    const info = message({ id: 'a', type: 'info' })
    const critical = message({ id: 'b', type: 'critical' })
    const warning = message({ id: 'c', type: 'warning' })

    expect(communityMessageQueue([info, critical, warning], []).map((m) => m.id)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  test('preserves server order within the same type', () => {
    const first = message({ id: 'first', type: 'warning' })
    const second = message({ id: 'second', type: 'warning' })
    const third = message({ id: 'third', type: 'warning' })

    expect(communityMessageQueue([first, second, third], []).map((m) => m.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  test('filters out acknowledged IDs before ordering', () => {
    const critical = message({ id: 'crit', type: 'critical' })
    const info = message({ id: 'info', type: 'info' })

    expect(communityMessageQueue([critical, info], ['crit']).map((m) => m.id)).toEqual(['info'])
  })

  test('skips invalid entries without hiding valid ones', () => {
    const valid = message({ id: 'ok', type: 'warning' })
    const noId = message({ id: '', type: 'info' })
    const emptyBody = message({ id: 'blank', type: 'info', body: '' })
    const badType = {
      id: 'weird',
      type: 'notice',
      body: 'x',
      action: null,
    } as unknown as CommunityMessage

    expect(communityMessageQueue([noId, valid, emptyBody, badType], []).map((m) => m.id)).toEqual([
      'ok',
    ])
  })
})

describe('currentCommunityMessage', () => {
  test('returns the highest-priority visible message', () => {
    const info = message({ id: 'a', type: 'info' })
    const warning = message({ id: 'b', type: 'warning' })

    expect(currentCommunityMessage([info, warning], [])?.id).toBe('b')
  })

  test('returns null when everything is acknowledged', () => {
    const only = message({ id: 'a' })
    expect(currentCommunityMessage([only], ['a'])).toBeNull()
  })
})

describe('acknowledgeCommunityMessage', () => {
  test('appends a new ID', () => {
    expect(acknowledgeCommunityMessage(['a'], 'b')).toEqual(['a', 'b'])
  })

  test('is idempotent and keeps the same reference for a known ID', () => {
    const ids = ['a', 'b']
    expect(acknowledgeCommunityMessage(ids, 'a')).toBe(ids)
  })
})

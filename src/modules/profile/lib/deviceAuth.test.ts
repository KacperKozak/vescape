import { describe, expect, test } from 'bun:test'

import { exchangeDeviceToken } from './deviceAuth'

describe('Device Token exchange', () => {
  test('identifies the installed app version to the Online Capability gate', async () => {
    const requests: Request[] = []
    const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return Promise.resolve(
        Response.json({ accountId: 'account-1', deviceToken: 'device-token' }, { status: 201 }),
      )
    }

    await exchangeDeviceToken({
      serverUrl: 'http://localhost:3000/',
      clerkToken: 'clerk-token',
      appVersion: '0.81.3',
      fetcher,
    })

    expect(requests[0]?.headers.get('Vescape-App-Version')).toBe('0.81.3')
  })
})

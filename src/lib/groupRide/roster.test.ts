import { describe, expect, test } from 'bun:test'
import type { GroupRideRider } from 'vesc-ble'

import { RIDER_DROP_AFTER_MS, RIDER_STALE_AFTER_MS, clientFreshRoster, riderRoster } from './roster'

const OWN = { lat: 50.0619, lng: 19.9368 }

function rider(id: string, lat: number | null, stale = false): GroupRideRider {
  return {
    id,
    name: id,
    color: null,
    stale,
    lastSeen: 0,
    presence: lat == null ? null : { lat, lng: OWN.lng },
  }
}

describe('riderRoster', () => {
  test('drops the current Rider from the shared roster', () => {
    expect(
      riderRoster([rider('me', OWN.lat), rider('bob', OWN.lat)], 'me', OWN, 0).map((r) => r.id),
    ).toEqual(['bob'])
  })

  test('sorts fresh riders with locations before stale or locationless riders', () => {
    const result = riderRoster(
      [
        rider('stale', OWN.lat, true),
        rider('far', OWN.lat + 0.02),
        rider('near', OWN.lat + 0.001),
        rider('none', null),
      ],
      'me',
      OWN,
      0,
    )

    expect(result.map((r) => r.id)).toEqual(['near', 'far', 'none', 'stale'])
    expect(result[0].distanceM).toBeLessThan(result[1].distanceM!)
  })

  test('keeps null distance when own location is unavailable', () => {
    expect(riderRoster([rider('bob', OWN.lat)], null, null, 0)[0].distanceM).toBeNull()
  })

  test('greys riders from the client clock before the server marks stale', () => {
    const now = 10_000
    const rows = riderRoster(
      [{ ...rider('bob', OWN.lat), lastSeen: now - RIDER_STALE_AFTER_MS }],
      null,
      OWN,
      now,
    )

    expect(rows[0].stale).toBe(true)
  })

  test('drops silent riders from the client clock', () => {
    const now = 40_000
    const fresh = { ...rider('fresh', OWN.lat), lastSeen: now - RIDER_DROP_AFTER_MS + 1 }
    const dropped = { ...rider('dropped', OWN.lat), lastSeen: now - RIDER_DROP_AFTER_MS }

    expect(clientFreshRoster([fresh, dropped], now).map((r) => r.id)).toEqual(['fresh'])
  })
})

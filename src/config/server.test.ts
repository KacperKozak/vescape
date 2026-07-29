import { expect, test } from 'bun:test'

import { toGroupRideWebSocketUrl } from '@/config/server'

test.each([
  ['https://api.vescape.app', 'wss://api.vescape.app/ws/group-rides'],
  ['http://localhost:3000', 'ws://localhost:3000/ws/group-rides'],
  ['http://localhost:3000/', 'ws://localhost:3000/ws/group-rides'],
])('builds the dedicated Group Ride WebSocket endpoint from %s', (serverUrl, expected) => {
  expect(toGroupRideWebSocketUrl(serverUrl)).toBe(expected)
})

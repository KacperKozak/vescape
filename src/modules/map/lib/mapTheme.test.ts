import { describe, expect, test } from 'bun:test'

import { themeOverrideForMapStyle } from '@/modules/map/lib/mapTheme'

describe('themeOverrideForMapStyle', () => {
  test('explicit dark and light basemaps override only the current app session', () => {
    expect(themeOverrideForMapStyle('onedark')).toBe('dark')
    expect(themeOverrideForMapStyle('outdoors')).toBe('light')
  })

  test('neutral imagery styles restore the configured theme', () => {
    expect(themeOverrideForMapStyle('satellite')).toBeNull()
    expect(themeOverrideForMapStyle('mapy')).toBeNull()
  })
})

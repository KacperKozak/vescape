import { describe, expect, test } from 'bun:test'

import { getHistoryPreviewRoute } from './previewRoute'

describe('history preview route', () => {
  test('uses available minute-bucket coordinates for approximate camera framing', () => {
    expect(
      getHistoryPreviewRoute([
        { longitude: 19, latitude: 50 },
        { longitude: null, latitude: null },
        { longitude: 19.2, latitude: 50.2 },
      ]),
    ).toEqual([
      [19, 50],
      [19.2, 50.2],
    ])
  })

  test('drops non-finite coordinates', () => {
    expect(getHistoryPreviewRoute([{ longitude: Number.NaN, latitude: 50 }])).toEqual([])
  })
})

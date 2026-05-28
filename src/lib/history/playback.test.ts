import { expect, test } from 'bun:test'

import { downsampleTimeSeries, findNearestSampleIndexByTime } from './playback'

const samples = [{ capturedAtMs: 1_000 }, { capturedAtMs: 2_000 }, { capturedAtMs: 4_000 }]

test('findNearestSampleIndexByTime finds exact and nearest neighbors', () => {
  expect(findNearestSampleIndexByTime(samples, 2_000)).toBe(1)
  expect(findNearestSampleIndexByTime(samples, 2_600)).toBe(1)
  expect(findNearestSampleIndexByTime(samples, 3_500)).toBe(2)
  expect(findNearestSampleIndexByTime(samples, 200)).toBe(0)
  expect(findNearestSampleIndexByTime(samples, 10_000)).toBe(2)
})

test('downsampleTimeSeries returns same array when below limit', () => {
  const input = [{ capturedAtMs: 1 }, { capturedAtMs: 2 }, { capturedAtMs: 3 }]
  const output = downsampleTimeSeries(input, 5, (s) => s.capturedAtMs)
  expect(output).toBe(input)
})

test('downsampleTimeSeries handles empty input', () => {
  const output = downsampleTimeSeries<{ capturedAtMs: number }>([], 5, (s) => s.capturedAtMs)
  expect(output).toEqual([])
})

test('downsampleTimeSeries preserves first and last points', () => {
  const input = Array.from({ length: 20 }, (_, i) => ({ capturedAtMs: i }))
  const output = downsampleTimeSeries(input, 6, (s) => s.capturedAtMs)
  expect(output[0]).toEqual(input[0])
  expect(output[output.length - 1]).toEqual(input[input.length - 1])
})

test('downsampleTimeSeries reduces long arrays to at most maxPoints', () => {
  const input = Array.from({ length: 1000 }, (_, i) => ({ capturedAtMs: i * 10 }))
  const output = downsampleTimeSeries(input, 75, (s) => s.capturedAtMs)
  expect(output.length).toBeLessThanOrEqual(75)
})

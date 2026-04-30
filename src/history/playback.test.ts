import { expect, test } from 'bun:test'

import { clampHeadTime, findNearestSampleIndexByTime, stepHeadTime } from './playback'

const samples = [{ capturedAtMs: 1_000 }, { capturedAtMs: 2_000 }, { capturedAtMs: 4_000 }]

test('findNearestSampleIndexByTime finds exact and nearest neighbors', () => {
  expect(findNearestSampleIndexByTime(samples, 2_000)).toBe(1)
  expect(findNearestSampleIndexByTime(samples, 2_600)).toBe(1)
  expect(findNearestSampleIndexByTime(samples, 3_500)).toBe(2)
  expect(findNearestSampleIndexByTime(samples, 200)).toBe(0)
  expect(findNearestSampleIndexByTime(samples, 10_000)).toBe(2)
})

test('stepHeadTime clamps to session range', () => {
  expect(stepHeadTime(2_000, -1, 5_000, 1_000, 4_000)).toBe(1_000)
  expect(stepHeadTime(2_000, 1, 5_000, 1_000, 4_000)).toBe(4_000)
  expect(stepHeadTime(2_000, 1, 500, 1_000, 4_000)).toBe(2_500)
})

test('clampHeadTime clamps playback end correctly', () => {
  expect(clampHeadTime(10_000, 1_000, 4_000)).toBe(4_000)
  expect(clampHeadTime(500, 1_000, 4_000)).toBe(1_000)
})

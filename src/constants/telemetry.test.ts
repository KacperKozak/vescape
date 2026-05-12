import { expect, test } from 'bun:test'

import { telemetry, telemetryByControlId } from './telemetry'

test('formatWithUnit omits spacing for unitless metrics', () => {
  expect(telemetry.footpadAdc1.formatWithUnit(1.23456)).toBe('1.235')
})

test('speed formatting uses absolute rounded values', () => {
  expect(telemetry.speed.formatWithUnit(-12.4)).toBe('12 km/h')
})

test('control id lookup resolves alert-enabled metrics', () => {
  expect(telemetryByControlId['motor-current']).toBe(telemetry.motorCurrent)
  expect(telemetryByControlId.battery).toBe(telemetry.battVoltage)
})

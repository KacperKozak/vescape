import { describe, expect, test } from 'bun:test'

import { buildOpenMeteoHourlyForecast, isNightAtTime, parseHourLabel } from './weather'

describe('Open-Meteo hourly forecasts', () => {
  test('keeps offsetless local forecast hours from API order', () => {
    const hourly = buildOpenMeteoHourlyForecast({
      times: ['2026-06-10T23:00', '2026-06-11T00:00', '2026-06-11T01:00'],
      temperatures: [18.2, 17.8, 17.5],
      weatherCodes: [0, 1, 2],
      precipitationProbabilities: [null, 10, 20],
    })

    expect(hourly).toEqual([
      {
        hour: '23:00',
        hourNum: 23,
        minuteNum: 0,
        temperature: 18,
        weatherCode: 0,
        precipitationProbability: 0,
      },
      {
        hour: '0:00',
        hourNum: 0,
        minuteNum: 0,
        temperature: 18,
        weatherCode: 1,
        precipitationProbability: 10,
      },
      {
        hour: '1:00',
        hourNum: 1,
        minuteNum: 0,
        temperature: 18,
        weatherCode: 2,
        precipitationProbability: 20,
      },
    ])
  })

  test('formats API local hour without runtime timezone conversion', () => {
    expect(parseHourLabel('2026-06-10T14:00')).toBe('14:00')
  })

  test('uses sunrise and sunset to decide night', () => {
    expect(isNightAtTime(5, 59, '2026-06-10T06:00', '2026-06-10T20:30')).toBe(true)
    expect(isNightAtTime(6, 0, '2026-06-10T06:00', '2026-06-10T20:30')).toBe(false)
    expect(isNightAtTime(20, 30, '2026-06-10T06:00', '2026-06-10T20:30')).toBe(true)
  })
})

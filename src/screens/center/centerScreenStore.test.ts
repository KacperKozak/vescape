import { beforeEach, describe, expect, test } from 'bun:test'

import { useCenterScreenStore } from './centerScreenStore'

beforeEach(() => {
  useCenterScreenStore.getState().reset()
})

describe('centerScreenStore', () => {
  test('starts in live telemetry mode with collapsed map selectors', () => {
    const state = useCenterScreenStore.getState()

    expect(state.mode).toBe('telemetry')
    expect(state.historySheetVisible).toBe(false)
    expect(state.mapSelector).toBe(null)
    expect(state.perspectiveEnabled).toBe(true)
    expect(state.seekTimeMs).toBe(null)
  })

  test('keeps only one compact map selector open', () => {
    const store = useCenterScreenStore.getState()

    store.enterMap()
    store.setMapSelector('navigation')
    expect(useCenterScreenStore.getState().mapSelector).toBe('navigation')

    store.setMapSelector('style')
    expect(useCenterScreenStore.getState().mapSelector).toBe('style')

    store.enterTelemetry()
    expect(useCenterScreenStore.getState().mapSelector).toBe(null)
  })

  test('clears map selectors on map interaction and when leaving map mode', () => {
    const store = useCenterScreenStore.getState()
    let changes = 0
    const unsubscribe = useCenterScreenStore.subscribe(() => {
      changes += 1
    })

    store.dismissMapSelector()
    expect(changes).toBe(0)
    unsubscribe()

    store.enterMap()
    store.setMapSelector('style')
    store.dismissMapSelector()
    expect(useCenterScreenStore.getState().mapSelector).toBe(null)

    store.setMapSelector('navigation')
    store.enterWeather()
    expect(useCenterScreenStore.getState().mapSelector).toBe(null)

    store.enterMap()
    store.setMapSelector('style')
    store.enterHistory()
    expect(useCenterScreenStore.getState().mapSelector).toBe(null)
  })

  test('transitions between center screen modes', () => {
    const store = useCenterScreenStore.getState()

    store.enterMap()
    expect(useCenterScreenStore.getState().mode).toBe('map')

    store.enterHistory()
    expect(useCenterScreenStore.getState().mode).toBe('history')

    store.enterTelemetry()
    expect(useCenterScreenStore.getState().mode).toBe('telemetry')
  })

  test('clears ride review UI state when returning to telemetry', () => {
    const store = useCenterScreenStore.getState()

    store.setHistorySheetVisible(true)
    store.setSeekTimeMs(1234)
    store.enterTelemetry()

    const state = useCenterScreenStore.getState()
    expect(state.mode).toBe('telemetry')
    expect(state.historySheetVisible).toBe(false)
    expect(state.seekTimeMs).toBe(null)
  })
})

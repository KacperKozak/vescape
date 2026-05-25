import { beforeEach, describe, expect, test } from 'bun:test'

import { useCenterScreenStore } from './centerScreenStore'

beforeEach(() => {
  useCenterScreenStore.getState().reset()
})

describe('centerScreenStore', () => {
  test('starts in live telemetry mode with default map UI settings', () => {
    const state = useCenterScreenStore.getState()

    expect(state.mode).toBe('telemetry')
    expect(state.historySheetVisible).toBe(false)
    expect(state.mapStyleKey).toBe('onedark')
    expect(state.rotationLocked).toBe(true)
    expect(state.perspectiveEnabled).toBe(true)
    expect(state.seekTimeMs).toBe(null)
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

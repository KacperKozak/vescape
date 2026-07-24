import { beforeEach, expect, mock, test } from 'bun:test'

const actualVescapeCore = await import('@/../modules/vescape-core/src/index')
const setLegalMode = mock(async () => {})

mock.module('vescape-core', () => ({
  ...actualVescapeCore,
  setLegalMode,
}))

beforeEach(() => {
  setLegalMode.mockClear()
})

test('sends per-board enable intent to native', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled('board-2', true)

  expect(setLegalMode).toHaveBeenCalledWith('board-2', true)
})

test('sends per-board disable intent to native', async () => {
  const { useLegalModeStore } = await import('@/modules/legal/store/legalModeStore')

  await useLegalModeStore.getState().setEnabled('board-2', false)

  expect(setLegalMode).toHaveBeenCalledWith('board-2', false)
})

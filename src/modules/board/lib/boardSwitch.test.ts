import { expect, mock, test } from 'bun:test'

import { switchBoard } from '@/modules/board/lib/boardSwitch'

test('stops recording and disconnects before selecting another board', async () => {
  const events: string[] = []
  let finishDisconnect: (() => void) | undefined
  const disconnected = new Promise<void>((resolve) => {
    finishDisconnect = resolve
  })
  const stopTelemetryRecording = mock(() => events.push('stop recording'))
  const disconnect = mock(async () => {
    events.push('disconnect')
    await disconnected
  })
  const setActiveBoard = mock((id: string) => events.push(`select ${id}`))

  const switching = switchBoard('board-a', 'board-b', {
    stopTelemetryRecording,
    disconnect,
    setActiveBoard,
  })

  expect(events).toEqual(['stop recording', 'disconnect'])
  expect(setActiveBoard).not.toHaveBeenCalled()

  finishDisconnect?.()
  await switching

  expect(events).toEqual(['stop recording', 'disconnect', 'select board-b'])
})

test('does nothing when board is already active', async () => {
  const stopTelemetryRecording = mock(() => {})
  const disconnect = mock(async () => {})
  const setActiveBoard = mock(() => {})

  await switchBoard('board-a', 'board-a', { stopTelemetryRecording, disconnect, setActiveBoard })

  expect(stopTelemetryRecording).not.toHaveBeenCalled()
  expect(disconnect).not.toHaveBeenCalled()
  expect(setActiveBoard).not.toHaveBeenCalled()
})

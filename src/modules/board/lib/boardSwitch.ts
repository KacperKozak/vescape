export interface BoardSwitchPort {
  stopTelemetryRecording(): void
  disconnect(): Promise<void>
  setActiveBoard(id: string): void
}

/**
 * A Board switch ends the current Board Session before changing durable
 * selection. This keeps live telemetry and Ride Recording bound to one Board.
 */
export async function switchBoard(
  currentBoardId: string | null,
  nextBoardId: string,
  { stopTelemetryRecording, disconnect, setActiveBoard }: BoardSwitchPort,
): Promise<void> {
  if (currentBoardId === nextBoardId) return

  stopTelemetryRecording()
  await disconnect()
  setActiveBoard(nextBoardId)
}

import type { Board, BoardCandidate, BoardTransport } from 'vesc-ble'

/** Human-readable label for a Board Transport, including the undetected case. */
export function formatBoardTransport(transport: BoardTransport | null): string {
  if (transport == null) return 'Not detected'
  if (transport === 'direct') return 'Direct'
  return `CAN id ${transport}`
}

/** Default selection from confirmed candidates: the first valid one, or null when empty. */
export function pickDefaultCandidate(candidates: BoardCandidate[]): BoardCandidate | null {
  return candidates[0] ?? null
}

/**
 * Suffix describing a Board Link's probe-detected smart-BMS presence, for appending to a
 * transport label. Empty for legacy links (`undefined`) where presence is unknown.
 */
export function formatBmsSuffix(hasBms: boolean | undefined): string {
  if (hasBms === true) return ' · BMS'
  if (hasBms === false) return ' · no BMS'
  return ''
}

/** A Board needs a Board Probe before it can start a Board Session when it has no link. */
export function boardNeedsLink(board: Pick<Board, 'link'> | undefined): boolean {
  return board?.link == null
}

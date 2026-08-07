import { canRunFirmwareCommand } from '@/modules/board/lib/boardLinkIntegrity'
import { useBleStore } from '@/modules/board/store/bleStore'
import { startBoardMove, stopBoardMove } from 'vescape-core'

/**
 * Board Move input the rider gets while holding a direction button.
 *
 * Deliberately far below the `-127..127` full scale: this is a walk-the-board-
 * around-the-garage speed, not a ride. The board still clamps it by its own
 * `remote.max_move_speed` / `remote_throttle_current_max` config.
 */
const BOARD_MOVE_INPUT = 25

/**
 * Hold-to-move control over the board's motor. The board only acts on it while
 * disengaged (nobody on the pads), which is the firmware's own rule.
 */
export function useBoardMoveControl() {
  const boardConnected = useBleStore((state) => state.status === 'connected')
  const linkIntegrity = useBleStore((state) => state.linkIntegrity)
  const canCommand = boardConnected && canRunFirmwareCommand(linkIntegrity)

  return {
    canCommand,
    moveForward: () => {
      if (canCommand) void startBoardMove(BOARD_MOVE_INPUT)
    },
    moveBackward: () => {
      if (canCommand) void startBoardMove(-BOARD_MOVE_INPUT)
    },
    // Unconditional: a release must stop the board even if the link just lost trust.
    stopMove: () => void stopBoardMove(),
  }
}

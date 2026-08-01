export type EdgeDrawerScrollEndAction = 'finish' | 'continue-closing' | 'stay-open'

interface EdgeDrawerScrollEndState {
  closeRequested: boolean
  fullyHidden: boolean
  withinAutoCloseRange: boolean
}

/** Decide how the drawer settles when native scrolling or a user drag ends. */
export function edgeDrawerScrollEndAction({
  closeRequested,
  fullyHidden,
  withinAutoCloseRange,
}: EdgeDrawerScrollEndState): EdgeDrawerScrollEndAction {
  if (fullyHidden) return 'finish'
  if (closeRequested || withinAutoCloseRange) return 'continue-closing'
  return 'stay-open'
}

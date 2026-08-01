import { describe, expect, test } from 'bun:test'

import { edgeDrawerScrollEndAction } from '@/components/overlays/edgeDrawerClose'

describe('edgeDrawerScrollEndAction', () => {
  test('continues an interrupted requested close outside the manual auto-close range', () => {
    expect(
      edgeDrawerScrollEndAction({
        closeRequested: true,
        fullyHidden: false,
        withinAutoCloseRange: false,
      }),
    ).toBe('continue-closing')
  })

  test('preserves manual drawer settling when no close was requested', () => {
    expect(
      edgeDrawerScrollEndAction({
        closeRequested: false,
        fullyHidden: false,
        withinAutoCloseRange: false,
      }),
    ).toBe('stay-open')
    expect(
      edgeDrawerScrollEndAction({
        closeRequested: false,
        fullyHidden: false,
        withinAutoCloseRange: true,
      }),
    ).toBe('continue-closing')
  })

  test('finishes once the drawer reaches its hidden edge', () => {
    expect(
      edgeDrawerScrollEndAction({
        closeRequested: true,
        fullyHidden: true,
        withinAutoCloseRange: true,
      }),
    ).toBe('finish')
  })
})

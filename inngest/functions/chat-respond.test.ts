import { describe, it, expect, beforeEach } from 'vitest'
import { shouldRefreshContext } from './chat-respond'

describe('shouldRefreshContext', () => {
  it('fires at turn 3 with default interval', () => {
    expect(shouldRefreshContext(3, 3)).toBe(true)
  })

  it('fires at turn 6 and 9 with default interval', () => {
    expect(shouldRefreshContext(6, 3)).toBe(true)
    expect(shouldRefreshContext(9, 3)).toBe(true)
  })

  it('does not fire at turns 1, 2, 4, 5', () => {
    expect(shouldRefreshContext(1, 3)).toBe(false)
    expect(shouldRefreshContext(2, 3)).toBe(false)
    expect(shouldRefreshContext(4, 3)).toBe(false)
    expect(shouldRefreshContext(5, 3)).toBe(false)
  })

  it('does not fire when realUserTurnCount is 0', () => {
    expect(shouldRefreshContext(0, 3)).toBe(false)
  })

  it('respects a custom interval', () => {
    expect(shouldRefreshContext(5, 5)).toBe(true)
    expect(shouldRefreshContext(10, 5)).toBe(true)
    expect(shouldRefreshContext(3, 5)).toBe(false)
    expect(shouldRefreshContext(4, 5)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { badgeCount, tabMark } from '../src/renderer/src/lib/tabMark'
import { contrastText } from '../src/renderer/src/lib/contrast'

describe('tab status mark', () => {
  it('ranks conflict over commits to push over changed files', () => {
    expect(tabMark('conflict', 3)).toEqual({ kind: 'conflict' })
    expect(tabMark('wip', 2)).toEqual({ kind: 'push', count: 2, changes: true })
    expect(tabMark(null, 2)).toEqual({ kind: 'push', count: 2, changes: false })
    expect(tabMark('wip', 0)).toEqual({ kind: 'changes' })
    expect(tabMark(null, 0)).toBeNull()
  })

  it('caps the badge at two digits', () => {
    expect(badgeCount(7)).toBe('7')
    expect(badgeCount(99)).toBe('99')
    expect(badgeCount(1000)).toBe('99+')
  })

  it('puts dark text on light badge colours and white on dark ones', () => {
    expect(contrastText('#ffffff')).toBe('#10121a')
    expect(contrastText('#fff')).toBe('#10121a')
    expect(contrastText('#f6c89a')).toBe('#10121a')
    expect(contrastText('#6c5ce7')).toBe('#fff')
    expect(contrastText('var(--accent)')).toBe('#fff')
  })
})

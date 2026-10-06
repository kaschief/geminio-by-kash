import { describe, expect, it } from 'vitest'
import { placeMenu, placePopover, MENU_MARGIN } from '../src/renderer/src/lib/menuPlacement'

const view = { width: 1000, height: 800 }
const menu = { width: 240, height: 300 }
// The menu covers the pointer when the point sits inside its box.
const covers = (p: { left: number; top: number }, size: typeof menu, at: { x: number; y: number }): boolean =>
  at.x >= p.left && at.x <= p.left + size.width && at.y >= p.top && at.y <= p.top + size.height

describe('placeMenu', () => {
  it('hangs below and right of the pointer when it fits', () => {
    const p = placeMenu({ x: 100, y: 100 }, menu, view)
    expect(p.top).toBeGreaterThan(100)
    expect(p.left).toBeGreaterThan(100)
    expect(p.origin).toBe('top left')
  })

  it('flips above the pointer near the bottom instead of sliding over the row', () => {
    const at = { x: 100, y: 700 }
    const p = placeMenu(at, menu, view)
    expect(p.top + menu.height).toBeLessThan(at.y)
    expect(covers(p, menu, at)).toBe(false)
    expect(p.origin).toBe('bottom left')
  })

  it('flips to the left near the right edge', () => {
    const at = { x: 900, y: 100 }
    const p = placeMenu(at, menu, view)
    expect(p.left + menu.width).toBeLessThan(at.x)
    expect(p.origin).toBe('top right')
  })

  it('a menu taller than either side stays on screen, on the roomier side', () => {
    const tall = { width: 240, height: 600 }
    const low = placeMenu({ x: 100, y: 600 }, tall, view)
    expect(low.top).toBe(MENU_MARGIN)
    const high = placeMenu({ x: 100, y: 150 }, tall, view)
    expect(high.top + tall.height).toBeLessThanOrEqual(view.height - MENU_MARGIN)
    expect(high.top).toBeGreaterThanOrEqual(MENU_MARGIN)
  })

  it('the screenshot case: a long file menu opened mid-window no longer covers the row', () => {
    const at = { x: 430, y: 470 }
    const p = placeMenu(at, { width: 240, height: 440 }, { width: 900, height: 900 })
    expect(covers(p, { width: 240, height: 440 }, at)).toBe(false)
  })
})

describe('placePopover', () => {
  const pop = { width: 280, height: 120 }
  it('opens below the anchor with the arrow on it', () => {
    const anchor = { left: 400, top: 100, width: 80, height: 24 }
    const p = placePopover(anchor, pop, view)
    expect(p.side).toBe('below')
    expect(p.top).toBeGreaterThan(anchor.top + anchor.height)
    expect(p.left + p.arrow).toBeCloseTo(440)
  })
  it('opens above near the bottom of the window', () => {
    const anchor = { left: 400, top: 740, width: 80, height: 24 }
    const p = placePopover(anchor, pop, view)
    expect(p.side).toBe('above')
    expect(p.top + pop.height).toBeLessThan(anchor.top)
  })
  it('slides in from the edge but keeps pointing at the anchor', () => {
    const anchor = { left: 960, top: 100, width: 30, height: 24 }
    const p = placePopover(anchor, pop, view)
    expect(p.left + pop.width).toBeLessThanOrEqual(view.width - MENU_MARGIN)
    expect(p.left + p.arrow).toBeGreaterThan(960)
  })
  it('beside a file row: to its left, arrow on the row, rows below left uncovered', () => {
    const anchor = { left: 760, top: 300, width: 220, height: 24 }
    const p = placePopover(anchor, pop, view, 'beside')
    expect(p.side).toBe('left')
    expect(p.left + pop.width).toBeLessThan(anchor.left)
    expect(p.top + p.arrow).toBeCloseTo(312)
  })
  it('beside, with no room on either side, falls back to below', () => {
    const anchor = { left: 20, top: 100, width: 960, height: 24 }
    expect(placePopover(anchor, pop, view, 'beside').side).toBe('below')
  })
})

import { describe, expect, it } from 'vitest'
import { placeMenu, MENU_MARGIN } from '../src/renderer/src/lib/menuPlacement'

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

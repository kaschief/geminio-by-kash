import { describe, it, expect } from 'vitest'
import { edgeFades, fadeSize, hasMoreBelow, revealOffset, scrollsVertically } from '../src/renderer/src/lib/scrollFade'

describe('scroll fade', () => {
  it('fades only while content remains below, ignoring sub-pixel leftovers', () => {
    expect(hasMoreBelow(1000, 400, 0)).toBe(true)
    expect(hasMoreBelow(1000, 400, 600)).toBe(false)
    expect(hasMoreBelow(1000, 400, 599.5)).toBe(false)
    expect(hasMoreBelow(400, 400, 0)).toBe(false)
  })

  it('treats only real vertical scrollers as scrollers', () => {
    expect(scrollsVertically('auto')).toBe(true)
    expect(scrollsVertically('scroll')).toBe(true)
    expect(scrollsVertically('hidden')).toBe(false)
    expect(scrollsVertically('visible')).toBe(false)
  })

})

describe('fadeSize', () => {
  it('keeps the full fade on a tall scroller', () => {
    expect(fadeSize(600, 20)).toBe(20)
  })

  it('shrinks with a short scroller so its rows stay readable', () => {
    expect(fadeSize(60, 20)).toBe(15)
  })

  it('never thins below a visible hint', () => {
    expect(fadeSize(20, 20)).toBe(12)
  })
})

describe('edgeFades', () => {
  it('fades nothing when everything fits', () => {
    expect(edgeFades(0, 500, 500, 32)).toEqual({ start: 0, end: 0 })
  })

  it('fades only the side that hides tabs', () => {
    expect(edgeFades(0, 500, 900, 32)).toEqual({ start: 0, end: 32 })
    expect(edgeFades(400, 500, 900, 32)).toEqual({ start: 32, end: 0 })
    expect(edgeFades(200, 500, 900, 32)).toEqual({ start: 32, end: 32 })
  })

  it('narrows a fade as its end comes into view', () => {
    expect(edgeFades(10, 500, 900, 32)).toEqual({ start: 10, end: 32 })
    expect(edgeFades(390, 500, 900, 32)).toEqual({ start: 32, end: 10 })
  })

  it('ignores sub-pixel leftovers at either end', () => {
    expect(edgeFades(399.5, 500, 900, 32).end).toBe(0)
    expect(edgeFades(0.5, 500, 900, 32).start).toBe(0)
  })
})

describe('revealOffset', () => {
  it('leaves a tab alone when it is clear of both fades', () => {
    expect(revealOffset(100, 120, 0, 500, 32)).toBeNull()
  })

  it('scrolls a tab under the start fade fully into view', () => {
    expect(revealOffset(10, 120, 200, 500, 32)).toBe(178)
    expect(revealOffset(-80, 120, 50, 500, 32)).toBe(0)
  })

  it('scrolls a tab under the end fade fully into view', () => {
    expect(revealOffset(420, 120, 0, 500, 32)).toBe(72)
  })
})

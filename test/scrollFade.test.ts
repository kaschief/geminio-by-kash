import { describe, it, expect } from 'vitest'
import { fadeSize, hasMoreBelow, scrollsVertically } from '../src/renderer/src/lib/scrollFade'

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

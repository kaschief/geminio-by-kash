import { describe, it, expect } from 'vitest'
import { canFrost, hasMoreBelow, scrollsVertically } from '../src/renderer/src/lib/scrollFade'

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

  it('frosts only scrollers that stack top to bottom and have no ::after of their own', () => {
    expect(canFrost('none', 'block', 'row')).toBe(true)
    expect(canFrost('none', 'flex', 'column')).toBe(true)
    expect(canFrost('none', 'flex', 'row')).toBe(false)
    expect(canFrost('""', 'block', 'row')).toBe(false)
    expect(canFrost('none', 'grid', 'row')).toBe(false)
  })
})

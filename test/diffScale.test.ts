import { describe, it, expect } from 'vitest'
import { DIFF_SCALES, normalizeDiffScale } from '../src/renderer/src/lib/diffScale'

describe('diff size setting', () => {
  it('never offers a size above the diff as drawn today', () => {
    expect(DIFF_SCALES[0]).toBe(1)
    expect(DIFF_SCALES.every((s) => s <= 1)).toBe(true)
  })
  it('keeps every offered size', () => {
    for (const s of DIFF_SCALES) expect(normalizeDiffScale(s)).toBe(s)
  })
  it('reads anything else as the default size', () => {
    for (const raw of [undefined, null, 0, 1.25, 2, 0.5, 0.85, '0.8', NaN]) {
      expect(normalizeDiffScale(raw)).toBe(1)
    }
  })
})

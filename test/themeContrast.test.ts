import { describe, it, expect } from 'vitest'
import { EXTRA_APP_THEMES, EXTRA_CODE_THEMES } from '../src/renderer/src/theme/extraThemes'
import { APP_THEMES, CODE_THEMES } from '../src/renderer/src/theme/themes'

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('extra themes', () => {
  it('are all listed, each with a code theme of the same id', () => {
    for (const t of EXTRA_APP_THEMES) {
      expect(APP_THEMES).toContain(t)
      expect(CODE_THEMES.some((c) => c.id === t.id)).toBe(true)
    }
    expect(EXTRA_CODE_THEMES).toHaveLength(EXTRA_APP_THEMES.length)
  })

  it('keeps ids unique across every built-in theme', () => {
    expect(new Set(APP_THEMES.map((t) => t.id)).size).toBe(APP_THEMES.length)
    expect(new Set(CODE_THEMES.map((t) => t.id)).size).toBe(CODE_THEMES.length)
  })

  for (const app of EXTRA_APP_THEMES) {
    const code = EXTRA_CODE_THEMES.find((c) => c.id === app.id)!
    for (const mode of ['light', 'dark'] as const) {
      it(`${app.name} ${mode} meets WCAG AA on the panel background`, () => {
        const a = app[mode]
        const c = code[mode]
        const bg = a.bg1
        expect(contrast(a.text0, bg)).toBeGreaterThanOrEqual(7)
        expect(contrast(a.text1, bg)).toBeGreaterThanOrEqual(4.5)
        for (const ui of [a.text2, a.accent, a.green, a.red, a.yellow]) expect(contrast(ui, bg)).toBeGreaterThanOrEqual(3)
        for (const token of [c.keyword, c.string, c.number, c.function, c.type, c.tag]) {
          expect(contrast(token, bg)).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

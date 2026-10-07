import { describe, it, expect } from 'vitest'
import { DIFF_TINT_ALPHA, DIFF_TINT_FG_SHARE } from '../src/renderer/src/theme/themes'
import { blendHex } from '../src/renderer/src/lib/contrast'
import { findGraphPalette, normalizeRowAccent, paletteColors, resolveRowColor, ROW_COLOR_THEME, THEME_PALETTE_ID, themeLanePalette } from '../src/renderer/src/graph/style'
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

describe('graph colours that follow the theme', () => {
  const colors = EXTRA_APP_THEMES[0].dark

  it('builds ten distinct lane colours from the theme', () => {
    const lanes = themeLanePalette(colors)
    expect(lanes).toHaveLength(10)
    expect(lanes.slice(0, 5)).toEqual([colors.accent, colors.purple, colors.green, colors.yellow, colors.red])
    for (const c of lanes) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('fills in only the theme palette', () => {
    const theme = findGraphPalette(THEME_PALETTE_ID, [])
    expect(paletteColors(theme, colors)).toEqual(themeLanePalette(colors))
    const classic = findGraphPalette('classic', [])
    expect(paletteColors(classic, colors)).toBe(classic.colors)
  })

  it('resolves the theme row colour to the accent and keeps the others', () => {
    expect(resolveRowColor(ROW_COLOR_THEME, '#123456')).toBe('#123456')
    expect(resolveRowColor('#abcdef', '#123456')).toBe('#abcdef')
    expect(resolveRowColor(null, '#123456')).toBeNull()
  })

  it('keeps a saved theme row colour and drops anything unknown', () => {
    expect(normalizeRowAccent({ color: 'theme' }).color).toBe('theme')
    expect(normalizeRowAccent({ color: '#a1b2c3' }).color).toBe('#a1b2c3')
    expect(normalizeRowAccent({ color: 'purple' }).color).toBeNull()
  })
})

describe('diff colours on tinted themes', () => {
  it('draws diffs from the theme on every new theme and leaves the originals alone', () => {
    for (const t of EXTRA_APP_THEMES) expect(t.tintedDiffs).toBe(true)
    for (const t of APP_THEMES.filter((a) => !EXTRA_APP_THEMES.includes(a))) expect(t.tintedDiffs).toBeUndefined()
  })
})

describe('theme-coloured diff text', () => {
  const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const toHex = (c: number[]): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  const over = (fg: string, alpha: number, bg: string): string => {
    const [f, b] = [rgb(fg), rgb(bg)]
    return toHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)))
  }

  for (const app of EXTRA_APP_THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${app.name} ${mode} keeps added and removed text readable on a changed word`, () => {
        const c = app[mode]
        const a = DIFF_TINT_ALPHA[mode]
        for (const [base, row, word] of [[c.green, a.addRow, a.addWord], [c.red, a.delRow, a.delWord]] as const) {
          const fill = over(base, word, over(base, row, c.bg1))
          expect(contrast(blendHex(base, c.text0, DIFF_TINT_FG_SHARE), fill)).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

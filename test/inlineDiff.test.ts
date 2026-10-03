import { describe, it, expect } from 'vitest'
import { parseDiff, wordDiff } from '../src/renderer/src/lib/diff'
import {
  buildInlinePairs,
  inlineSegments,
  inlineText,
  readDiffLayout,
  INLINE_MAX_CHANGED
} from '../src/renderer/src/lib/inlineDiff'

const diffOf = (...body: string[]): string =>
  ['diff --git a/f b/f', '--- a/f', '+++ b/f', '@@ -1,9 +1,9 @@', ...body].join('\n')

describe('inline segments', () => {
  it('interleaves the removed and added words around what stayed', () => {
    expect(inlineSegments('const retries = 3', 'const retries = 5')).toEqual([
      { text: 'const retries = ', kind: 'same' },
      { text: '3', kind: 'del' },
      { text: '5', kind: 'add' }
    ])
  })

  it('reads old-then-new where a word was replaced mid-line', () => {
    const segs = inlineSegments('return foo(a, b)', 'return bar(a, b)')!
    expect(segs.map((s) => s.kind)).toEqual(['same', 'del', 'add', 'same'])
    expect(inlineText(segs).text).toBe('return foobar(a, b)')
  })

  it('gives up when more than half the line changed', () => {
    expect(INLINE_MAX_CHANGED).toBe(0.5)
    expect(inlineSegments('let total = price * qty', 'await sendInvoice(customer, items)')).toBeNull()
  })

  it('gives up on a whitespace-only edit, which would strike through nothing visible', () => {
    expect(inlineSegments('  port: 3000,', '    port: 3000,')).toBeNull()
  })

  it('gives up on identical lines and lines with nothing in common', () => {
    expect(inlineSegments('same', 'same')).toBeNull()
    expect(inlineSegments('alpha', 'omega')).toBeNull()
  })

  it('uses the same tokens as the word diff, so the two layouts agree on what changed', () => {
    const a = 'if (user.isAdmin) return true'
    const b = 'if (user.isOwner) return true'
    const { del, add } = wordDiff(a, b)
    const segs = inlineSegments(a, b)!
    expect(segs.filter((s) => s.kind === 'del').map((s) => s.text)).toEqual(del.map(([s, e]) => a.slice(s, e)))
    expect(segs.filter((s) => s.kind === 'add').map((s) => s.text)).toEqual(add.map(([s, e]) => b.slice(s, e)))
  })
})

describe('inline text', () => {
  it('reports where the removed and added parts sit in the merged line', () => {
    const { text, del, add } = inlineText([
      { text: 'x = ', kind: 'same' },
      { text: '1', kind: 'del' },
      { text: '2', kind: 'add' }
    ])
    expect(text).toBe('x = 12')
    expect(del).toEqual([[4, 5]])
    expect(add).toEqual([[5, 6]])
  })
})

describe('inline pairs', () => {
  it('pairs a deletion run with an equal-length addition run, line by line', () => {
    const lines = parseDiff(diffOf(' a', '-  retries: 3,', '-  timeout: 1000,', '+  retries: 5,', '+  timeout: 2000,', ' b'))
    const pairs = buildInlinePairs(lines)
    expect([...pairs.values()].map((p) => [lines[p.del].text, lines[p.add].text])).toEqual([
      ['  retries: 3,', '  retries: 5,'],
      ['  timeout: 1000,', '  timeout: 2000,']
    ])
  })

  it('leaves runs that do not pair one-to-one as plain lines', () => {
    const lines = parseDiff(diffOf('-  retries: 3,', '+  retries: 5,', '+  debug: true,'))
    expect(buildInlinePairs(lines).size).toBe(0)
  })

  it('falls back per pair: a rewritten line stays −/+ while its small neighbour merges', () => {
    const lines = parseDiff(
      diffOf('-  retries: 3,', '-  handler: legacyHandler(req),', '+  retries: 5,', '+  onDone: () => queue.flush(),')
    )
    const pairs = buildInlinePairs(lines)
    expect(pairs.size).toBe(1)
    expect(lines[[...pairs.values()][0].del].text).toBe('  retries: 3,')
  })

  it('never merges an excluded (moved) line, nor the run it sits in', () => {
    const lines = parseDiff(diffOf('-  retries: 3,', '+  retries: 5,'))
    const del = lines.findIndex((l) => l.kind === 'del')
    expect(buildInlinePairs(lines, new Set([del])).size).toBe(0)
  })
})

describe('diff layout preference', () => {
  it('reads the saved layout, falling back to the old split flag, then unified', () => {
    expect(readDiffLayout('inline', 'on')).toBe('inline')
    expect(readDiffLayout(null, 'on')).toBe('split')
    expect(readDiffLayout(null, 'off')).toBe('unified')
    expect(readDiffLayout('bogus', null)).toBe('unified')
  })
})

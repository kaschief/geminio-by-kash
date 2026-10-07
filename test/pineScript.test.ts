import { describe, it, expect } from 'vitest'
import { guessLanguage, highlightLine } from '../src/renderer/src/lib/highlight'

const pine = (line: string): string => highlightLine(line, guessLanguage('levels.pine'))

describe('Pine Script highlighting', () => {
  it('recognises .pine files', () => {
    expect(guessLanguage('levels.pine')).toBe('pinescript')
  })

  it('colours keywords, types, built-ins, calls, strings and numbers', () => {
    const html = pine('requestGlobexSnapshot(string tickerId, int lookback) => request.security(tickerId, "D", [open, ta.sma(high - low, 14)])')
    expect(html).toContain('<span class="hljs-title function_">requestGlobexSnapshot</span>')
    expect(html).toContain('<span class="hljs-type">string</span>')
    expect(html).toContain('<span class="hljs-built_in">request</span>')
    expect(html).toContain('<span class="hljs-built_in">ta</span>')
    expect(html).toContain('<span class="hljs-string">&quot;D&quot;</span>')
    expect(html).toContain('<span class="hljs-number">14</span>')
    expect(html).toContain('<span class="hljs-operator">=&gt;</span>')
  })

  it('marks annotations, comments, literals and colour constants', () => {
    expect(pine('//@version=6')).toContain('hljs-meta')
    expect(pine('// LEVEL DRAWING METHODS')).toContain('hljs-comment')
    expect(pine('if not na(this.upper) and x == true')).toMatch(/hljs-keyword">if<.*hljs-keyword">not<.*hljs-title function_">na<.*hljs-keyword">and<.*hljs-literal">true</)
    expect(pine('this.lblUpper := na')).toContain('<span class="hljs-literal">na</span>')
    expect(pine('var color c = #ff8800AA')).toContain('<span class="hljs-number">#ff8800AA</span>')
  })
})

import type { HLJSApi, Language } from 'highlight.js'

/**
 * TradingView Pine Script (v5/v6) for highlight.js, which ships no grammar for
 * it. Keyword lists follow the Pine reference; anything not listed still reads
 * as plain code, so a newer built-in only loses its colour, never breaks a line.
 */
export function pineScript(hljs: HLJSApi): Language {
  return {
    name: 'Pine Script',
    aliases: ['pine', 'pinescript'],
    keywords: {
      keyword: 'if else for to by in while switch var varip import export method type enum and or not as break continue',
      literal: 'true false na',
      type: 'int float bool string color line label box table array matrix map polyline linefill series simple const',
      built_in: [
        // Namespaces, so `ta.` / `math.` / `request.` read as library calls.
        'ta math request str array matrix map line label box table color strategy input timeframe syminfo barstate session chart runtime log',
        // Declarations and the drawing/plot family.
        'indicator library plot plotshape plotchar plotcandle plotbar plotarrow hline fill bgcolor barcolor alert alertcondition',
        // Series and helpers every script touches.
        'open high low close volume hl2 hlc3 ohlc4 hlcc4 time time_close time_tradingday bar_index last_bar_index timenow nz fixnan timestamp year month weekofyear dayofmonth dayofweek hour minute second'
      ].join(' ')
    },
    contains: [
      // `//@version=6`, `//@function`, `//@param` … before ordinary comments.
      { scope: 'meta', begin: /\/\/@\w+/, end: /$/ },
      hljs.COMMENT('//', '$'),
      hljs.QUOTE_STRING_MODE,
      hljs.APOS_STRING_MODE,
      // Colour literals: #RRGGBB and #RRGGBBAA.
      { scope: 'number', match: /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/ },
      hljs.C_NUMBER_MODE,
      // A call is a name before `(`, unless the name is a keyword: `if (x)` is control flow.
      { scope: 'title.function', match: /\b(?!(?:if|else|for|to|by|in|while|switch|and|or|not|var|varip|import|export|method|type|enum|as|break|continue)\b)[A-Za-z_]\w*(?=\s*\()/ },
      { scope: 'operator', match: /=>|:=|[-+*/%]=|==|!=|<=|>=|\?|:/ }
    ]
  }
}

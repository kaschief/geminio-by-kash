import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  SplitSquareHorizontal,
  Columns2,
  Pilcrow,
  Search,
  ChevronUp,
  ChevronDown,
  WrapText,
  Link2,
  Unlink2,
  X
} from 'lucide-react'
import { highlightHtml, buildQueryRegExp, type HighlightLayer } from './FileSearchBar'
import { highlightLine } from '../lib/highlight'
import { maskSecretLine } from '../lib/secrets'
import { useT, interp } from '../i18n'
import { buildLinePatch, extractHunks, singleHunkPatch } from '../lib/hunkPatch'
import { useSettingsStore } from '../stores/settings'
import { useHoverExplain } from './HoverExplain'
import type { NumberedLine } from '../../../shared/types'
import {
  parseDiff,
  wordRangesByLine,
  buildSplitRows,
  type DiffLine,
  type Range,
  type SplitCell,
  type SplitRow
} from '../lib/diff'

/**
 * Wrap the given decoded-character ranges in <mark class> within an HTML string
 * (post-hljs/search-highlight), tracking a running decoded offset across all
 * tag-free segments so marks never break tags or entities.
 */
function markRanges(html: string, ranges: Range[], cls: string): string {
  if (ranges.length === 0) return html
  const inRange = (idx: number): boolean => ranges.some(([s, e]) => idx >= s && idx < e)
  let pos = 0
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag, text) => {
    if (tag) return tag
    const tokens = (text as string).match(/&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;|&#x[0-9a-fA-F]+;|[\s\S]/g) ?? []
    let out = ''
    let open = false
    for (const tok of tokens) {
      const hit = inRange(pos)
      if (hit && !open) {
        out += `<mark class="${cls}">`
        open = true
      } else if (!hit && open) {
        out += '</mark>'
        open = false
      }
      out += tok
      pos++
    }
    if (open) out += '</mark>'
    return out
  })
}

/** Above this many parsed lines the viewer gets `is-huge` — the browser skips
 *  layout/paint for offscreen rows (`content-visibility: auto`) while the DOM
 *  stays complete, so find, staging clicks and selection behave as before. */
const HUGE_LINES = 5000

/**
 * Something a hunk (or a line selection) can be sent to. The host decides which
 * apply to the diff on screen — stage and discard for unstaged changes, unstage
 * for staged ones, revert for a commit, apply for a stash.
 */
export interface HunkAction {
  id: string
  /** Button on each hunk's @@ bar. */
  hunkLabel: string
  /** Button on the line-selection bar, given how many lines are selected. */
  linesLabel: (n: number) => string
  /** The patch will be applied reversed, so a line selection is built mirrored. */
  reverse: boolean
  /** Throws work away — drawn in the danger colour. */
  danger?: boolean
  run: (patch: string) => void
}

/**
 * One display toggle. Inside a host toolbar it is icon-only, matching the
 * segmented controls beside it; floating over the diff it keeps its label,
 * since there is no surrounding context to explain a bare icon.
 */
function DiffToggle({
  hosted,
  on,
  disabled = false,
  label,
  title,
  onClick,
  children
}: {
  hosted: boolean
  on: boolean
  disabled?: boolean
  label: string
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`${hosted ? 'diff-tool' : 'diff-word-toggle'} ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={hosted ? label : undefined}
      // aria-disabled, not disabled: a disabled button gets no pointer events, so
      // the tip explaining *why* it is off could never appear.
      aria-disabled={disabled || undefined}
      title={hosted ? undefined : title}
      data-tip={hosted ? title : undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
      {!hosted && ` ${label}`}
    </button>
  )
}

export function DiffViewer({
  diff,
  file = '',
  lang = '',
  highlightLayers = [],
  maskValues = false,
  ignoreWs = false,
  onToggleIgnoreWs,
  hunkActions = [],
  toolbarHost,
  externalFind
}: {
  diff: string
  /** Path of the file being diffed — labels the hover-explain card. */
  file?: string
  lang?: string
  highlightLayers?: HighlightLayer[]
  /** Mask secret values (KEY=••••) in displayed lines — secret files only. */
  maskValues?: boolean
  /** Whether the diff was fetched ignoring whitespace (drives the toggle state). */
  ignoreWs?: boolean
  /** Re-fetch the diff with/without `-w`. When absent, the toggle is hidden. */
  onToggleIgnoreWs?: () => void
  /** Hunk/line actions for this diff; none means a read-only diff. */
  hunkActions?: HunkAction[]
  /**
   * Where the display toggles render. Omitted, they float over the diff, which
   * suits the comparison dialogs that have no toolbar of their own. A host that
   * does (the file viewer header) passes its slot; `null` means that slot has
   * not mounted yet, and the toggles wait rather than flash inside the diff.
   */
  toolbarHost?: HTMLElement | null
  /**
   * A host with its own find bar (the file viewer) passes it here. The Find
   * toggle then drives that bar and ⌘F is left to the host, so one view never
   * shows two different find bars depending on where focus happened to be.
   */
  externalFind?: { open: boolean; toggle: () => void }
}): React.JSX.Element {
  const t = useT()
  const lines = useMemo(() => parseDiff(diff), [diff])

  // ─── Hover-to-explain over the diff's own lines ───
  const aiEnabled = useSettingsStore((s) => s.activeProfile().ai.enabled !== false)
  const hoverOn = useSettingsStore((s) => s.activeProfile().ai.hoverExplain !== false)
  const hoverKey = useSettingsStore((s) => s.activeProfile().ai.hoverExplainKey ?? 'shift')
  // The diff only shows hunks, so the window has gaps. Numbers come from the new
  // side where there is one, and from the old side for removed lines.
  const hoverLines = useMemo<NumberedLine[]>(
    () =>
      lines
        .filter((l) => l.kind === 'add' || l.kind === 'del' || l.kind === 'ctx')
        .map((l) => ({ no: l.newNo ?? l.oldNo ?? 0, text: l.text }))
        .filter((l) => l.no > 0),
    [lines]
  )
  const { hoverProps, armed: hoverArmed, card: hoverCard } = useHoverExplain({
    enabled: aiEnabled && hoverOn && !maskValues,
    file,
    lang,
    modifier: hoverKey,
    getLines: () => hoverLines,
    lineOf: (el) => {
      const row = el.closest('.diff-line, .diff-split-cell')
      if (!row) return null
      const gutters = [...row.querySelectorAll('.diff-gutter')].map((g) => Number(g.textContent?.trim()))
      // Unified rows carry old and new; the new number is the one to cite.
      const no = gutters.reverse().find((n) => Number.isInteger(n) && n > 0)
      return no ?? null
    }
  })
  const hasHunkActions = hunkActions.length > 0
  const hunkData = useMemo(() => (hasHunkActions ? extractHunks(diff) : null), [diff, hasHunkActions])

  const [wordDiffOn, setWordDiffOn] = useState(() => localStorage.getItem('gitcito-word-diff') !== 'off')
  useEffect(() => localStorage.setItem('gitcito-word-diff', wordDiffOn ? 'on' : 'off'), [wordDiffOn])

  const [splitView, setSplitView] = useState(() => localStorage.getItem('gitcito-split-diff') === 'on')
  useEffect(() => localStorage.setItem('gitcito-split-diff', splitView ? 'on' : 'off'), [splitView])

  // Split-view line wrapping. Off by default: one line per row keeps the two
  // sides row-for-row comparable, which is the point of split view. On, long
  // lines fold inside their column instead of scrolling.
  const [wrapOn, setWrapOn] = useState(() => localStorage.getItem('gitcito-diff-wrap') === 'on')
  useEffect(() => localStorage.setItem('gitcito-diff-wrap', wrapOn ? 'on' : 'off'), [wrapOn])

  // Scrolling with wrap off: each column fully on its own, or the two locked
  // together both ways — vertically and sideways. Locked is the default: the
  // sides are worth comparing at the same row and column, and one that drifts
  // is the reason to look away from a split view.
  const [linkScroll, setLinkScroll] = useState(() => localStorage.getItem('gitcito-diff-link-scroll') !== 'off')
  useEffect(() => localStorage.setItem('gitcito-diff-link-scroll', linkScroll ? 'on' : 'off'), [linkScroll])

  // Per-line changed-character ranges (for word-level highlighting).
  const wordRanges = useMemo(() => wordRangesByLine(lines), [lines])

  // Side-by-side rows (ctx mirrored, del-runs zipped with following add-runs).
  const splitRows = useMemo(() => buildSplitRows(lines), [lines])

  // ── In-diff find (⌘F) ──
  const viewerRef = useRef<HTMLDivElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const findRe = useMemo(
    () => (findQuery.trim() ? buildQueryRegExp({ query: findQuery.trim(), caseSensitive: false, wholeWord: false, regex: false }, true) : null),
    [findQuery]
  )
  // The find layer rides on top of any externally-supplied search layers.
  const layers = useMemo<HighlightLayer[]>(
    () => (findRe ? [...highlightLayers, { re: findRe, className: 'diff-find-hit' }] : highlightLayers),
    [highlightLayers, findRe]
  )

  // Render one cell's HTML: syntax highlight → search layers → word marks (or
  // secret mask). Shared by unified and split views.
  const cellHtml = (text: string, idx: number, kind: 'add' | 'del' | 'ctx'): string => {
    const t = maskValues ? maskSecretLine(text) : text
    let html = highlightHtml(highlightLine(t, lang), layers)
    const wr = !maskValues && wordDiffOn && kind !== 'ctx' ? wordRanges.get(idx) : undefined
    if (wr) html = markRanges(html, wr, kind === 'add' ? 'word-add' : 'word-del')
    return html || '&nbsp;'
  }

  // Column-major split view scrolls each side on its own, so the vertical
  // position has to be mirrored by hand. The flag stops the mirrored write from
  // bouncing back as a second scroll event.
  const leftColRef = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)
  const syncScroll = (from: React.RefObject<HTMLDivElement>, to: React.RefObject<HTMLDivElement>): void => {
    if (syncingScroll.current || !from.current || !to.current) return
    const sameTop = !linkScroll || to.current.scrollTop === from.current.scrollTop
    const sameLeft = !linkScroll || to.current.scrollLeft === from.current.scrollLeft
    if (sameTop && sameLeft) return
    syncingScroll.current = true
    if (linkScroll) {
      to.current.scrollTop = from.current.scrollTop
      to.current.scrollLeft = from.current.scrollLeft
    }
    requestAnimationFrame(() => (syncingScroll.current = false))
  }

  // One side of a split row. An absent side is an empty cell rather than a gap,
  // so the two columns keep the same number of rows.
  // Changed cells are selectable for line actions, exactly as unified rows are —
  // `idx` points into the same `lines`, so one selection serves both views.
  const splitCell = (c: SplitCell | undefined, key: string): React.JSX.Element => {
    const selectable = hasHunkActions && !!c && c.kind !== 'ctx'
    return (
    <div
      key={key}
      className={`diff-split-cell ${c ? c.kind : 'empty'} ${selectable ? 'selectable' : ''} ${
        c && selected.has(c.idx) ? 'line-selected' : ''
      }`}
      onClick={selectable && c ? () => toggleLine(c.idx) : undefined}
      title={selectable ? t('diff.selectLineTitle') : undefined}
    >
      <span className="diff-gutter">{c?.no ?? ''}</span>
      {c ? (
        <span className="diff-text" dangerouslySetInnerHTML={{ __html: cellHtml(c.text, c.idx, c.kind) }} />
      ) : (
        <span className="diff-text" />
      )}
    </div>
    )
  }

  // The @@ bar. Column-major mode draws it in both columns — the left carries
  // the header text, the right the stage button, and together they read as one
  // bar without either column losing a row.
  const hunkButtons = (hunkIdx: number): React.JSX.Element | null =>
    hunkData ? (
      <span className="diff-hunk-actions">
        {hunkActions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`btn ghost tiny diff-stage-hunk${a.danger ? ' danger' : ''}`}
            onClick={() => a.run(singleHunkPatch(hunkData, hunkIdx))}
          >
            {a.hunkLabel}
          </button>
        ))}
      </span>
    ) : null
  const splitHunk = (r: SplitRow, key: number, side?: 'left' | 'right'): React.JSX.Element => (
    <div key={key} className="diff-split-hunk">
      <span className="diff-text">{side === 'right' ? '' : r.hunk}</span>
      {side !== 'left' && r.hunkIdx !== undefined && hunkButtons(r.hunkIdx)}
    </div>
  )

  // Line-level staging selection (only when staging is enabled). Keyed by index
  // into `lines`; cleared whenever the diff changes.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => setSelected(new Set()), [diff])

  const toggleLine = (i: number): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const runOnSelection = (action: HunkAction): void => {
    if (!hunkData || selected.size === 0) return
    action.run(buildLinePatch(lines, hunkData.header, selected, action.reverse ? 'reverse' : 'forward'))
    setSelected(new Set())
  }

  // Recount find matches whenever the query or rendered content changes.
  useEffect(() => {
    const root = viewerRef.current
    if (!root || !findRe) {
      setMatchCount(0)
      return
    }
    const n = root.querySelectorAll('.diff-find-hit').length
    setMatchCount(n)
    setMatchIdx((i) => (n ? Math.min(i, n - 1) : 0))
  }, [findRe, diff, splitView, wordDiffOn, maskValues])

  // Highlight + scroll the active match into view.
  useEffect(() => {
    const root = viewerRef.current
    if (!root) return
    const hits = root.querySelectorAll<HTMLElement>('.diff-find-hit')
    hits.forEach((h, i) => h.classList.toggle('current', i === matchIdx))
    hits[matchIdx]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [matchIdx, matchCount])

  const stepMatch = (dir: 1 | -1): void => {
    if (matchCount === 0) return
    setMatchIdx((i) => (i + dir + matchCount) % matchCount)
  }

  const openFind = (): void => {
    setFindOpen(true)
    requestAnimationFrame(() => findInputRef.current?.select())
  }
  const closeFind = (): void => {
    setFindOpen(false)
    setFindQuery('')
  }

  const onViewerKeyDown = (e: React.KeyboardEvent): void => {
    if (externalFind) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      e.stopPropagation()
      openFind()
    } else if (e.key === 'Escape' && findOpen) {
      closeFind()
    }
  }

  if (!diff.trim()) return <div className="diff-empty">{t('diff.noChanges')}</div>

  const hasWordDiffs = wordRanges.size > 0
  const hosted = toolbarHost !== undefined

  // Every toggle is always present, disabled when it does not apply, so the row
  // never reflows under the pointer: Wrap and Linked only mean anything in split
  // view, Linked only while each column scrolls on its own (wrap off).
  const toggles = (
    <div className={hosted ? 'diff-tools' : 'diff-toggles'} role="toolbar" aria-label={t('diff.toolsLabel')}>
      <DiffToggle hosted={hosted} on={splitView} label={t('diff.split')} title={t('diff.splitTitle')} onClick={() => setSplitView((v) => !v)}>
        <Columns2 size={hosted ? 13 : 12} />
      </DiffToggle>
      <DiffToggle
        hosted={hosted}
        on={splitView && wrapOn}
        disabled={!splitView}
        label={t('diff.wrap')}
        title={splitView ? t('diff.wrapTitle') : t('diff.splitOnlyTitle')}
        onClick={() => setWrapOn((v) => !v)}
      >
        <WrapText size={hosted ? 13 : 12} />
      </DiffToggle>
      <DiffToggle
        hosted={hosted}
        on={splitView && !wrapOn && linkScroll}
        disabled={!splitView || wrapOn}
        label={t('diff.linkScroll')}
        title={!splitView ? t('diff.splitOnlyTitle') : wrapOn ? t('diff.linkScrollWrapTitle') : t('diff.linkScrollTitle')}
        onClick={() => setLinkScroll((v) => !v)}
      >
        {linkScroll ? <Link2 size={hosted ? 13 : 12} /> : <Unlink2 size={hosted ? 13 : 12} />}
      </DiffToggle>
      {onToggleIgnoreWs && (
        <DiffToggle hosted={hosted} on={ignoreWs} label={t('diff.whitespace')} title={t('diff.whitespaceTitle')} onClick={onToggleIgnoreWs}>
          <Pilcrow size={hosted ? 13 : 12} />
        </DiffToggle>
      )}
      <DiffToggle
        hosted={hosted}
        on={hasWordDiffs && wordDiffOn}
        disabled={!hasWordDiffs}
        label={t('diff.wordDiff')}
        title={hasWordDiffs ? t('diff.wordDiffTitle') : t('diff.wordDiffNoneTitle')}
        onClick={() => setWordDiffOn((v) => !v)}
      >
        <SplitSquareHorizontal size={hosted ? 13 : 12} />
      </DiffToggle>
      <DiffToggle
        hosted={hosted}
        on={externalFind ? externalFind.open : findOpen}
        label={t('diff.find')}
        title={t('diff.findTitle')}
        onClick={externalFind ? externalFind.toggle : findOpen ? closeFind : openFind}
      >
        <Search size={hosted ? 13 : 12} />
      </DiffToggle>
    </div>
  )

  return (
    <div
      className={`diff-viewer hljs ${splitView ? 'is-split' : ''} ${splitView && !wrapOn ? 'is-nowrap' : ''} ${
        lines.length > HUGE_LINES ? 'is-huge' : ''
      } ${hoverArmed ? 'hover-armed' : ''}`}
      ref={viewerRef}
      tabIndex={0}
      onKeyDown={onViewerKeyDown}
      {...hoverProps}
    >
      {hoverCard}
      {toolbarHost === undefined ? toggles : toolbarHost ? createPortal(toggles, toolbarHost) : null}
      {findOpen && (
        <div className="diff-find">
          <Search size={13} className="diff-find-icon" />
          <input
            ref={findInputRef}
            className="diff-find-input"
            placeholder={t('diff.findPlaceholder')}
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stepMatch(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                closeFind()
              }
            }}
          />
          <span className="diff-find-count">{matchCount ? `${matchIdx + 1}/${matchCount}` : findQuery ? '0/0' : ''}</span>
          <button className="diff-find-btn" title={t('diff.prevMatch')} disabled={matchCount === 0} onClick={() => stepMatch(-1)}>
            <ChevronUp size={14} />
          </button>
          <button className="diff-find-btn" title={t('diff.nextMatch')} disabled={matchCount === 0} onClick={() => stepMatch(1)}>
            <ChevronDown size={14} />
          </button>
          <button className="diff-find-btn" title={t('diff.closeFind')} onClick={closeFind}>
            <X size={14} />
          </button>
        </div>
      )}
      {hasHunkActions && selected.size > 0 && (
        <div className="diff-select-bar" role="status">
          <span>{interp(t('diff.linesSelected'), { n: selected.size, s: selected.size === 1 ? '' : 's' })}</span>
          <button className="btn ghost tiny" onClick={() => setSelected(new Set())}>
            {t('diff.clearSelection')}
          </button>
          {hunkActions.map((a, i) => (
            <button
              key={a.id}
              type="button"
              // The first action is the everyday one; the rest stay quieter.
              className={`btn tiny ${a.danger ? 'danger' : i === 0 ? 'primary' : 'ghost'}`}
              onClick={() => runOnSelection(a)}
            >
              {a.linesLabel(selected.size)}
            </button>
          ))}
        </div>
      )}
      {splitView ? (
        wrapOn ? (
          <div className="diff-split">
            {splitRows.map((r, i) =>
              r.hunk !== undefined ? (
                splitHunk(r, i)
              ) : (
                <div key={i} className="diff-split-row">
                  {splitCell(r.left, `${i}l`)}
                  {splitCell(r.right, `${i}r`)}
                </div>
              )
            )}
          </div>
        ) : (
          // Wrap off: a scrollbar per side, which needs one scroller per side —
          // hence column-major DOM. Each column scrolls both ways; the vertical
          // scroll is mirrored so the sides stay row-for-row, and the horizontal
          // one is not, which is the whole point. Rows line up because every
          // cell is exactly one line tall and the hunk bar spans both columns.
          <div className="diff-split is-cols">
            <div className="diff-split-col" ref={leftColRef} onScroll={() => syncScroll(leftColRef, rightColRef)}>
              {/* The inner block is as wide as the column's longest line, and every
                  row fills it — a row sized to its own text would leave its
                  background behind as soon as you scrolled past it. */}
              <div className="diff-split-inner">
                {splitRows.map((r, i) => (r.hunk !== undefined ? splitHunk(r, i, 'left') : splitCell(r.left, `${i}l`)))}
              </div>
            </div>
            <div className="diff-split-col" ref={rightColRef} onScroll={() => syncScroll(rightColRef, leftColRef)}>
              <div className="diff-split-inner">
                {splitRows.map((r, i) => (r.hunk !== undefined ? splitHunk(r, i, 'right') : splitCell(r.right, `${i}r`)))}
              </div>
            </div>
          </div>
        )
      ) : (
        <>
      {lines.map((l, i) => {
        if (l.kind === 'meta') return null
        if (l.kind === 'hunk') {
          return (
            <div key={i} className="diff-line hunk">
              <span className="diff-gutter" />
              <span className="diff-gutter" />
              <span className="diff-text">{l.text}</span>
              {hunkButtons(l.hunkIdx)}
            </div>
          )
        }
        const selectable = hasHunkActions && (l.kind === 'add' || l.kind === 'del')
        return (
          <div
            key={i}
            className={`diff-line ${l.kind} ${selectable ? 'selectable' : ''} ${selected.has(i) ? 'line-selected' : ''}`}
            onClick={selectable ? () => toggleLine(i) : undefined}
            title={selectable ? t('diff.selectLineTitle') : undefined}
          >
            <span className="diff-gutter">{l.oldNo ?? ''}</span>
            <span className="diff-gutter">{l.newNo ?? ''}</span>
            <span className="diff-sign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}</span>
            <span
              className="diff-text"
              dangerouslySetInnerHTML={{ __html: cellHtml(l.text, i, l.kind as 'add' | 'del' | 'ctx') }}
            />
          </div>
        )
      })}
        </>
      )}
    </div>
  )
}

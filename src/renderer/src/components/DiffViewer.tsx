import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Highlighter,
  MoveVertical,
  Pilcrow,
  Search,
  ChevronUp,
  ChevronDown,
  WrapText,
  Link2,
  Unlink2,
  X
} from 'lucide-react'
import { InlineGlyph, SplitGlyph, UnifiedGlyph } from './diffLayoutGlyphs'
import { highlightHtml, buildQueryRegExp, type HighlightLayer } from './FileSearchBar'
import { highlightLine } from '../lib/highlight'
import { maskSecretLine } from '../lib/secrets'
import { useT, interp, type TranslationKey } from '../i18n'
import { useUIStore, anchorOf, type AnchorRect, type MenuItem } from '../stores/ui'
import { mi } from './menuIcons'
import { buildLinePatch, extractHunks, singleHunkPatch } from '../lib/hunkPatch'
import { useAiReady } from './useAiReady'
import { useSettingsStore } from '../stores/settings'
import { useHoverExplain } from './HoverExplain'
import type { NumberedLine } from '../../../shared/types'
import {
  parseDiff,
  wordRangesByLine,
  buildSplitRows,
  splitEditPartners,
  splitHunkHeader,
  type DiffLine,
  type Range,
  type SplitCell,
  type SplitRow
} from '../lib/diff'
import { findMovedLines, type MovedMark } from '../lib/movedLines'
import {
  buildInlinePairs,
  inlineText,
  readDiffLayout,
  DIFF_LAYOUT_KEY,
  LEGACY_SPLIT_KEY,
  type DiffLayout,
  type InlinePair
} from '../lib/inlineDiff'

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
  /** The right-click menu's row for the one line under the pointer. */
  lineLabel: string
  icon: React.ReactNode
  /** The same action on the whole hunk: a different glyph, so the line and
   *  hunk rows of one menu are told apart at a glance. */
  hunkIcon: React.ReactNode
  /** The patch will be applied reversed, so a line selection is built mirrored. */
  reverse: boolean
  /** Colour by direction: forward moves work ahead (green), backward takes it
   *  back or away (red); neutral touches no files. */
  intent: 'forward' | 'backward'
  /**
   * The action loses work, so its buttons ask twice in place: the first click
   * arms the button (filled red, these labels), the second does it.
   */
  armed?: { hunk: string; lines: (n: number) => string }
  /** `confirmed` once a button asked in place; otherwise the host asks beside
   *  the anchor, when the action needs asking at all. Resolves true when it
   *  changed something (false when cancelled or refused). */
  run: (patch: string, confirm: AnchorRect | 'confirmed') => Promise<boolean>
}

/** How long an armed button waits for its second click. */
const ARMED_MS = 3000
/** Longest the buttons stay off after an action, if the diff never changes. */
const PENDING_FALLBACK_MS = 2000

/**
 * One display toggle. Inside a host toolbar it is icon-only, matching the
 * segmented controls beside it; floating over the diff it keeps its label,
 * since there is no surrounding context to explain a bare icon.
 */
function DiffToggle({
  hosted,
  on,
  disabled = false,
  radio = false,
  label,
  title,
  onClick,
  children
}: {
  hosted: boolean
  on: boolean
  disabled?: boolean
  /** One option of a single choice (the layout): announced as a radio. */
  radio?: boolean
  label: string
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`${hosted ? 'diff-tool' : 'diff-word-toggle'} ${on ? 'on' : ''}`}
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? on : undefined}
      aria-pressed={radio ? undefined : on}
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

/** The layout choice, in toolbar order. Keys, not strings: a module constant
 *  would freeze the language active on first import. */
const LAYOUTS: { id: DiffLayout; labelKey: TranslationKey; titleKey: TranslationKey; Icon: (p: { size: number }) => React.JSX.Element }[] = [
  { id: 'unified', labelKey: 'diff.unified', titleKey: 'diff.unifiedTitle', Icon: UnifiedGlyph },
  { id: 'split', labelKey: 'diff.split', titleKey: 'diff.splitTitle', Icon: SplitGlyph },
  { id: 'inline', labelKey: 'diff.inline', titleKey: 'diff.inlineTitle', Icon: InlineGlyph }
]

const MOVE_ARROW: Record<MovedMark['dir'], string> = { up: '↑', down: '↓' }
const NO_MOVES = new Map<number, MovedMark>()
const NO_PAIRS = new Map<number, InlinePair>()
const NO_PARTNERS = new Map<number, number>()

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
  overlayHost,
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
   * A layer over the diff that does not scroll (the file viewer has one). The
   * line-selection actions then float there as a pill instead of a strip that
   * pushes the diff down mid-click. Same `null` meaning as `toolbarHost`.
   */
  overlayHost?: HTMLElement | null
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
  const aiEnabled = useAiReady('explain')
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
  const showHunkContext = useSettingsStore((s) => s.settings.diffHunkContext ?? true)
  const diffScale = useSettingsStore((s) => s.settings.diffScale ?? 1)
  // The @@ bar's label: line ranges, then — quieter, and optional — the code
  // git found around the hunk.
  const hunkLabel = (text: string): React.JSX.Element => {
    const { range, context } = splitHunkHeader(text)
    return (
      <span className="diff-text diff-hunk-label">
        <span className="diff-hunk-range">{range}</span>
        {showHunkContext && context && <span className="diff-hunk-context">{context}</span>}
      </span>
    )
  }
  const hasHunkActions = hunkActions.length > 0
  const hunkData = useMemo(() => (hasHunkActions ? extractHunks(diff) : null), [diff, hasHunkActions])

  const [wordDiffOn, setWordDiffOn] = useState(() => localStorage.getItem('gitcito-word-diff') !== 'off')
  useEffect(() => localStorage.setItem('gitcito-word-diff', wordDiffOn ? 'on' : 'off'), [wordDiffOn])

  // One layout of three. The old split flag still decides the first read, so
  // someone who left split view on keeps it.
  const [layout, setLayout] = useState<DiffLayout>(() =>
    readDiffLayout(localStorage.getItem(DIFF_LAYOUT_KEY), localStorage.getItem(LEGACY_SPLIT_KEY))
  )
  useEffect(() => localStorage.setItem(DIFF_LAYOUT_KEY, layout), [layout])
  const splitView = layout === 'split'

  // Moved code is marked by default: a block that only changed place is the
  // most common thing a reader mistakes for a rewrite.
  const [movedOn, setMovedOn] = useState(() => localStorage.getItem('gitcito-diff-moved') !== 'off')
  useEffect(() => localStorage.setItem('gitcito-diff-moved', movedOn ? 'on' : 'off'), [movedOn])

  // Line wrapping, for both views. Off by default: one line per row keeps split
  // view's two sides row-for-row comparable. On, long lines fold inside their
  // row (or column) instead of making the whole diff scroll sideways.
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

  const allMoved = useMemo(() => findMovedLines(lines), [lines])
  // An edited line in split view is one edit across two cells: clicking or
  // right-clicking either side acts on both, as the inline view's single row does.
  const splitPartners = useMemo(
    () => (layout === 'split' ? splitEditPartners(lines, new Set(allMoved.keys())) : NO_PARTNERS),
    [layout, lines, allMoved]
  )
  const moved = movedOn ? allMoved : NO_MOVES
  // Inline pairs never include moved lines — their partner is elsewhere — and a
  // masked secret file stays in plain −/+ form, which masks line by line.
  const inlinePairs = useMemo(
    () => (layout === 'inline' && !maskValues ? buildInlinePairs(lines, new Set(moved.keys())) : NO_PAIRS),
    [layout, maskValues, lines, moved]
  )
  const inlineAdds = useMemo(() => new Set([...inlinePairs.values()].map((p) => p.add)), [inlinePairs])

  // The gutter arrow's tip names the other end of the move by its line number.
  const movedTitle = (m: MovedMark): string =>
    m.role === 'out'
      ? interp(t('diff.movedTo'), { line: lines[m.peer].newNo ?? '' })
      : interp(t('diff.movedFrom'), { line: lines[m.peer].oldNo ?? '' })
  const movedClass = (idx: number): string => {
    const m = moved.get(idx)
    return m ? ` moved${m.block % 2 ? ' moved-alt' : ''}` : ''
  }

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
    // A moved line's word marks would compare it with whatever line happened to
    // sit opposite, which is not what it moved from.
    const wr = !maskValues && wordDiffOn && kind !== 'ctx' && !moved.has(idx) ? wordRanges.get(idx) : undefined
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
    const partner = c ? splitPartners.get(c.idx) : undefined
    const idxs = c ? (partner === undefined ? [c.idx] : [c.idx, partner].sort((a, b) => a - b)) : []
    return (
    <div
      key={key}
      className={`diff-split-cell ${c ? c.kind : 'empty'} ${selectable ? 'selectable' : ''} ${
        c && selected.has(c.idx) ? 'line-selected' : ''
      }${c ? movedClass(c.idx) : ''}`}
      onClick={selectable ? () => toggleLines(idxs) : undefined}
      onContextMenu={c ? (e) => openLineMenu(e, idxs, c.text) : undefined}
      title={selectable ? t('diff.selectLineTitle') : undefined}
    >
      {c && moved.has(c.idx) ? (
        <span
          className="diff-gutter"
          data-move={MOVE_ARROW[moved.get(c.idx)!.dir]}
          title={movedTitle(moved.get(c.idx)!)}
        >
          {c.no ?? ''}
        </span>
      ) : (
        <span className="diff-gutter">{c?.no ?? ''}</span>
      )}
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
            className={`btn ghost tiny diff-stage-hunk intent-${a.intent}${isArmed(a, `hunk:${hunkIdx}`) ? ' is-armed' : ''}`}
            disabled={pending}
            onClick={() => press(a, `hunk:${hunkIdx}`, () => fire(a.run(singleHunkPatch(hunkData, hunkIdx), 'confirmed')))}
          >
            {isArmed(a, `hunk:${hunkIdx}`) ? a.armed?.hunk : a.hunkLabel}
          </button>
        ))}
      </span>
    ) : null
  const splitHunk = (r: SplitRow, key: number, side?: 'left' | 'right'): React.JSX.Element => (
    <div key={key} className="diff-split-hunk">
      {side === 'right' ? <span className="diff-text" /> : hunkLabel(r.hunk ?? '')}
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
  // An edit's − and + select together, so a line action stages (or discards)
  // the whole edit: the inline view's one row, or a split row's two cells.
  const toggleLines = (idxs: number[]): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      const on = idxs.every((i) => next.has(i))
      for (const i of idxs) {
        if (on) next.delete(i)
        else next.add(i)
      }
      return next
    })
  const togglePair = (p: InlinePair): void => toggleLines([p.del, p.add])

  // From the click until the diff on screen reflects it, every action button is
  // off: a second press would act on lines that are already gone (or, between
  // stage and refresh, stage what was just discarded). Cleared by the new diff,
  // or at once when nothing changed (cancelled, refused).
  const [pending, setPending] = useState(false)
  useEffect(() => setPending(false), [diff])
  const fire = (result: Promise<boolean>): void => {
    setPending(true)
    void result.then(
      (ok) => {
        if (!ok) setPending(false)
        // A change that leaves the diff text identical still has to let go.
        else setTimeout(() => setPending(false), PENDING_FALLBACK_MS)
      },
      () => setPending(false)
    )
  }

  const runOnSelection = (action: HunkAction): void => {
    if (!hunkData || selected.size === 0) return
    fire(action.run(buildLinePatch(lines, hunkData.header, selected, action.reverse ? 'reverse' : 'forward'), 'confirmed'))
    setSelected(new Set())
  }

  // Ask-twice buttons: which one is armed, by action and place. Disarms on its
  // own after a moment, and whenever the diff changes under it.
  const [armedKey, setArmedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!armedKey) return
    const timer = setTimeout(() => setArmedKey(null), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armedKey])
  useEffect(() => setArmedKey(null), [diff])
  const isArmed = (a: HunkAction, where: string): boolean => !!a.armed && armedKey === `${a.id}:${where}`
  const press = (a: HunkAction, where: string, go: () => void): void => {
    if (a.armed && !isArmed(a, where)) return setArmedKey(`${a.id}:${where}`)
    setArmedKey(null)
    go()
  }

  // Right-click on a line, as in GitKraken: act on that line — or on the
  // selection, when the line is part of one — on its whole hunk, or copy it.
  // `idxs` is what the row shows: one line, or an inline row's − and + pair.
  const openLineMenu = (e: React.MouseEvent, idxs: number[], text: string): void => {
    const first = lines[idxs[0]]
    if (!first) return
    e.preventDefault()
    // A confirm from this menu points at the line, after the menu has closed.
    const row = anchorOf(e.currentTarget as Element)
    const items: MenuItem[] = []
    // While the last action is still landing the rows stay, greyed, saying why.
    const busyRow = pending ? { disabled: true, title: t('diff.busyRow') } : {}
    if (hunkData && hasHunkActions) {
      const changed = idxs.filter((i) => lines[i].kind === 'add' || lines[i].kind === 'del')
      const inSelection = changed.some((i) => selected.has(i))
      const target = inSelection ? new Set(selected) : new Set(changed)
      if (target.size > 0) {
        for (const a of hunkActions) {
          items.push({
            label: inSelection ? a.linesLabel(target.size) : a.lineLabel,
            icon: a.icon,
            danger: a.id === 'discard',
            ...busyRow,
            onClick: () => {
              fire(a.run(buildLinePatch(lines, hunkData.header, target, a.reverse ? 'reverse' : 'forward'), row))
              setSelected(new Set())
            }
          })
        }
        items.push({ separator: true })
      }
      for (const a of hunkActions) {
        items.push({
          label: a.hunkLabel,
          icon: a.hunkIcon,
          danger: a.id === 'discard',
          ...busyRow,
          onClick: () => fire(a.run(singleHunkPatch(hunkData, first.hunkIdx), row))
        })
      }
      items.push({ separator: true })
    }
    // Text picked inside the diff wins; otherwise the line, as it is shown
    // (a secret file's values stay masked on the clipboard too).
    const picked = window.getSelection()
    const pickedText = picked && viewerRef.current?.contains(picked.anchorNode) ? picked.toString() : ''
    items.push(
      pickedText
        ? { label: t('diff.copySelection'), icon: mi.copy(), onClick: () => void navigator.clipboard.writeText(pickedText) }
        : {
            label: t('diff.copyLine'),
            icon: mi.copy(),
            onClick: () => void navigator.clipboard.writeText(maskValues ? maskSecretLine(text) : text)
          }
    )
    useUIStore.getState().openContextMenu(e.clientX, e.clientY, items)
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
  }, [findRe, diff, layout, wordDiffOn, movedOn, maskValues])

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
  const hasMoves = allMoved.size > 0
  const selectBar = (
        <div className={`diff-select-bar${overlayHost === undefined ? '' : ' is-floating'}`} role="status">
          <span>{interp(t('diff.linesSelected'), { n: selected.size, s: selected.size === 1 ? '' : 's' })}</span>
          <button className="btn ghost tiny" onClick={() => setSelected(new Set())}>
            {t('diff.clearSelection')}
          </button>
          {hunkActions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`btn ghost tiny intent-${a.intent}${isArmed(a, 'selection') ? ' is-armed' : ''}`}
              disabled={pending}
              onClick={() => press(a, 'selection', () => runOnSelection(a))}
            >
              {isArmed(a, 'selection') ? a.armed?.lines(selected.size) : a.linesLabel(selected.size)}
            </button>
          ))}
        </div>
  )
  const hosted = toolbarHost !== undefined

  // Every toggle is always present, disabled when it does not apply, so the row
  // never reflows under the pointer: Linked only means anything in split view
  // while each column scrolls on its own (wrap off).
  const layoutChoice = (
    <div className={hosted ? 'diff-tools' : 'diff-layout-choice'} role="radiogroup" aria-label={t('diff.layoutLabel')}>
      {LAYOUTS.map(({ id, labelKey, titleKey, Icon }) => (
        <DiffToggle
          key={id}
          hosted={hosted}
          radio
          on={layout === id}
          label={t(labelKey)}
          title={t(titleKey)}
          onClick={() => setLayout(id)}
        >
          <Icon size={hosted ? 13 : 12} />
        </DiffToggle>
      ))}
    </div>
  )
  const options = (
    <div className={hosted ? 'diff-tools' : 'diff-toggles'} role="toolbar" aria-label={t('diff.toolsLabel')}>
      {!hosted && layoutChoice}
      <DiffToggle
        hosted={hosted}
        on={wrapOn}
        label={t('diff.wrap')}
        title={t('diff.wrapTitle')}
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
        <Highlighter size={hosted ? 13 : 12} />
      </DiffToggle>
      <DiffToggle
        hosted={hosted}
        on={hasMoves && movedOn}
        disabled={!hasMoves}
        label={t('diff.moved')}
        title={hasMoves ? t('diff.movedTitle') : t('diff.movedNoneTitle')}
        onClick={() => setMovedOn((v) => !v)}
      >
        <MoveVertical size={hosted ? 13 : 12} />
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
  // In a host toolbar the layout is its own segmented group beside the
  // toggles, like the file viewer's modes; floating, it leads the one row.
  const toggles = hosted ? (
    <>
      {layoutChoice}
      {options}
    </>
  ) : (
    options
  )

  return (
    <div
      className={`diff-viewer hljs ${splitView ? 'is-split' : ''} ${layout === 'inline' ? 'is-inline' : ''} ${splitView && !wrapOn ? 'is-nowrap' : ''} ${
        !splitView && wrapOn ? 'is-wrap' : ''
      } ${
        lines.length > HUGE_LINES ? 'is-huge' : ''
      } ${hoverArmed ? 'hover-armed' : ''}`}
      ref={viewerRef}
      style={{ '--diff-scale': diffScale } as React.CSSProperties}
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
            className={`diff-find-input${findQuery.trim() && matchCount === 0 ? ' is-no-results' : ''}`}
            placeholder={t('diff.findPlaceholder')}
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stepMatch(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                closeFind()
              }
            }}
          />
          <span className="diff-find-count" role="status" aria-live="polite">
            {matchCount
              ? interp(t('find.position'), { i: matchIdx + 1, n: matchCount })
              : findQuery.trim()
                ? t('search.noResults')
                : ''}
          </span>
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
      {hasHunkActions && selected.size > 0 &&
        (overlayHost === undefined ? selectBar : overlayHost ? createPortal(selectBar, overlayHost) : null)}
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
        if (l.kind === 'meta' || inlineAdds.has(i)) return null
        const pair = inlinePairs.get(i)
        if (pair) {
          const { text, del, add } = inlineText(pair.segments)
          let html = highlightHtml(highlightLine(text, lang), layers)
          html = markRanges(markRanges(html, del, 'inl-del'), add, 'inl-add')
          const pairSelected = selected.has(pair.del) || selected.has(pair.add)
          return (
            <div
              key={i}
              className={`diff-line inline ${hasHunkActions ? 'selectable' : ''} ${pairSelected ? 'line-selected' : ''}`}
              onClick={hasHunkActions ? () => togglePair(pair) : undefined}
              onContextMenu={(e) => openLineMenu(e, [pair.del, pair.add], lines[pair.add].text)}
              title={hasHunkActions ? t('diff.selectLineTitle') : undefined}
            >
              <span className="diff-gutter">{l.oldNo ?? ''}</span>
              <span className="diff-gutter">{lines[pair.add].newNo ?? ''}</span>
              <span className="diff-sign" role="img" aria-label={t('diff.inlineSign')}>
                ~
              </span>
              <span className="diff-text" dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
            </div>
          )
        }
        if (l.kind === 'hunk') {
          return (
            <div key={i} className="diff-line hunk">
              <span className="diff-gutter" />
              <span className="diff-gutter" />
              {hunkLabel(l.text)}
              {hunkButtons(l.hunkIdx)}
            </div>
          )
        }
        const selectable = hasHunkActions && (l.kind === 'add' || l.kind === 'del')
        return (
          <div
            key={i}
            className={`diff-line ${l.kind} ${selectable ? 'selectable' : ''} ${selected.has(i) ? 'line-selected' : ''}${movedClass(i)}`}
            onClick={selectable ? () => toggleLine(i) : undefined}
            onContextMenu={(e) => openLineMenu(e, [i], l.text)}
            title={selectable ? t('diff.selectLineTitle') : undefined}
          >
            <span className="diff-gutter">{l.oldNo ?? ''}</span>
            <span className="diff-gutter">{l.newNo ?? ''}</span>
            {moved.has(i) ? (
              <span className="diff-sign diff-move-sign" title={movedTitle(moved.get(i)!)}>
                {MOVE_ARROW[moved.get(i)!.dir]}
              </span>
            ) : (
              <span className="diff-sign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}</span>
            )}
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

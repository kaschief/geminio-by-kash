// The inline diff layout: a small edit shown as one line, removed words struck
// through and added ones lit, instead of a − line over a + line. Only pairs that
// stay readable are merged — the rest keep the ordinary −/+ rendering — and all
// of that is decided here, away from React, so it is testable.

import { tokenOps, type DiffLine } from './diff'

export type DiffLayout = 'unified' | 'split' | 'inline'

/** Storage key for the chosen layout. Before Inline existed it was a split
 *  on/off flag under `gitcito-split-diff`, which {@link readDiffLayout} honours. */
export const DIFF_LAYOUT_KEY = 'gitcito-diff-layout'
export const LEGACY_SPLIT_KEY = 'gitcito-split-diff'

/** The saved layout, falling back to the old split flag, then to unified. */
export function readDiffLayout(stored: string | null, legacySplit: string | null): DiffLayout {
  if (stored === 'unified' || stored === 'split' || stored === 'inline') return stored
  return legacySplit === 'on' ? 'split' : 'unified'
}

export interface InlineSegment {
  text: string
  kind: 'same' | 'del' | 'add'
}

/** One −/+ pair merged into a single inline line. */
export interface InlinePair {
  del: number
  add: number
  segments: InlineSegment[]
}

/** Above this share of changed characters a merged line stops being easier to
 *  read than the two lines it replaces — strike-throughs swamp the text. */
export const INLINE_MAX_CHANGED = 0.5

/**
 * Merge an old and a new line into segments, or `null` when the result would
 * not read well: more than half the characters changed, nothing visible
 * changed (a whitespace-only edit would strike through invisible spaces), or
 * there is nothing in common to anchor the eye.
 */
export function inlineSegments(oldText: string, newText: string): InlineSegment[] | null {
  const ops = tokenOps(oldText, newText)
  let changed = 0
  let visibleChange = false
  let common = false
  for (const o of ops) {
    if (o.op === 'same') {
      if (o.text.trim()) common = true
      continue
    }
    changed += o.text.length
    if (o.text.trim()) visibleChange = true
  }
  const total = oldText.length + newText.length
  if (!visibleChange || !common || total === 0 || changed / total > INLINE_MAX_CHANGED) return null

  const segments: InlineSegment[] = []
  for (const o of ops) {
    const last = segments[segments.length - 1]
    if (last && last.kind === o.op) last.text += o.text
    else segments.push({ text: o.text, kind: o.op })
  }
  return segments
}

/**
 * The pairs to merge, keyed by the deletion's index into `lines`. A deletion
 * run pairs with the addition run right after it only when the two are the
 * same length — otherwise which old line became which new one is a guess, and
 * a wrong guess reads worse than plain −/+. Lines in `exclude` (moved code)
 * are never merged, and a run containing one is left whole.
 */
export function buildInlinePairs(lines: DiffLine[], exclude: ReadonlySet<number> = new Set()): Map<number, InlinePair> {
  const pairs = new Map<number, InlinePair>()
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind !== 'del') {
      i++
      continue
    }
    const dels: number[] = []
    while (i < lines.length && lines[i].kind === 'del') dels.push(i++)
    const adds: number[] = []
    while (i < lines.length && lines[i].kind === 'add') adds.push(i++)
    if (dels.length !== adds.length) continue
    if ([...dels, ...adds].some((x) => exclude.has(x))) continue
    dels.forEach((d, k) => {
      const segments = inlineSegments(lines[d].text, lines[adds[k]].text)
      if (segments) pairs.set(d, { del: d, add: adds[k], segments })
    })
  }
  return pairs
}

/**
 * The merged line's text and where its removed and added parts sit in it, as
 * [start, end) offsets — what the viewer highlights once, then marks.
 */
export function inlineText(segments: InlineSegment[]): { text: string; del: [number, number][]; add: [number, number][] } {
  let text = ''
  const del: [number, number][] = []
  const add: [number, number][] = []
  for (const s of segments) {
    const start = text.length
    text += s.text
    if (s.kind === 'del') del.push([start, text.length])
    else if (s.kind === 'add') add.push([start, text.length])
  }
  return { text, del, add }
}
